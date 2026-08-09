#!/usr/bin/env node
/**
 * ES modules を1枚の HTML にまとめる。
 *
 *   node tools/bundle.mjs [出力先]
 *
 * なぜ必要か:
 *   ふだんは <script type="module"> で src/ を読み込んでいるが、
 *   これはブラウザが相対パスを取りに行ける環境 ―― つまり HTTP 配信 ―― が前提。
 *   PC でサーバーを立てられない場面（スマホしか手元にない等）では使えない。
 *   全部を1ファイルに畳んでしまえば、file:// でもそのまま開ける。
 *
 * やっていること:
 *   各モジュールを関数で包んで小さなレジストリに登録し、
 *   import / export をそのレジストリ呼び出しに書き換える。
 *   関数で包むので、モジュールごとのローカル変数が衝突しない
 *   （多くのファイルが `const W = Screen.W` を持っているので、単純連結はできない）。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src/main.js');

// --fragment: <head> を自前で持てない埋め込み先（ホスト側が head を用意する場合）向けに、
//             body の中身だけを出力する
const args = process.argv.slice(2).filter((a) => a !== '--fragment');
const FRAGMENT = process.argv.includes('--fragment');
const OUT = args[0]
  ? resolve(args[0])
  : join(ROOT, FRAGMENT ? 'dist/game-fragment.html' : 'dist/pokemon-dot-adventure.html');

// ---- モジュールの読み込みと変換 ----

const modules = new Map();   // id -> { code, deps }
const idOf = (abs) => relative(join(ROOT, 'src'), abs).split('\\').join('/');

/** `import ... from '...'` を1件ぶん取り出す正規表現（複数行の { } にも対応） */
const IMPORT_RE = /^import\s+([\s\S]*?)\s*from\s*'([^']+)';?[ \t]*$/gm;
const DYNAMIC_RE = /\bimport\s*\(\s*'([^']+)'\s*\)/g;

/** import 節を代入文に変換する */
function bindingFor(clause, id) {
  const parts = [];
  let rest = clause.trim();

  // 既定 import（`X` または `X, {…}` / `X, * as NS` の先頭）
  const defaultMatch = rest.match(/^([A-Za-z_$][\w$]*)\s*(?:,\s*)?/);
  if (defaultMatch && !rest.startsWith('{') && !rest.startsWith('*')) {
    parts.push(`const ${defaultMatch[1]} = __req(${JSON.stringify(id)}).default;`);
    rest = rest.slice(defaultMatch[0].length).trim();
  }

  if (rest.startsWith('*')) {
    const ns = rest.match(/^\*\s*as\s+([A-Za-z_$][\w$]*)/);
    parts.push(`const ${ns[1]} = __req(${JSON.stringify(id)});`);
  } else if (rest.startsWith('{')) {
    // { a, b as c } → { a, b: c }
    const inner = rest.slice(1, rest.lastIndexOf('}'))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = s.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        return m ? `${m[1]}: ${m[2]}` : s;
      })
      .join(', ');
    parts.push(`const { ${inner} } = __req(${JSON.stringify(id)});`);
  }
  return parts.join('\n');
}

function load(abs) {
  const id = idOf(abs);
  if (modules.has(id)) return;
  modules.set(id, null); // 循環検出用に先に置く

  let code = readFileSync(abs, 'utf8');
  const deps = [];
  const exported = new Set();
  let hasDefault = false;

  // 静的 import
  code = code.replace(IMPORT_RE, (_all, clause, spec) => {
    const depAbs = resolve(dirname(abs), spec);
    const depId = idOf(depAbs);
    deps.push(depAbs);
    return bindingFor(clause, depId);
  });

  // 動的 import
  code = code.replace(DYNAMIC_RE, (_all, spec) => {
    const depAbs = resolve(dirname(abs), spec);
    const depId = idOf(depAbs);
    deps.push(depAbs);
    return `__reqAsync(${JSON.stringify(depId)})`;
  });

  // export default（マップ定義のオブジェクトリテラルのみ）
  code = code.replace(/^export default /gm, () => {
    hasDefault = true;
    return 'const __default = ';
  });

  // export function / function* / class / const
  code = code.replace(
    /^export\s+(function\*?|class|const)\s+([A-Za-z_$][\w$]*)/gm,
    (_all, kind, name) => {
      exported.add(name);
      return `${kind} ${name}`;
    },
  );

  if (/^export\s/m.test(code)) {
    throw new Error(`${id}: 変換できない export が残っています\n` +
      code.split('\n').filter((l) => /^export\s/.test(l)).join('\n'));
  }

  const names = [...exported];
  if (hasDefault) names.push('default: __default');
  const tail = `\nObject.assign(__exports, { ${names.join(', ')} });\n`;

  modules.set(id, { code: code + tail, deps: deps.map(idOf) });
  for (const d of deps) load(d);
}

load(ENTRY);

// ---- 循環参照の検出 ----
{
  const state = new Map();
  const cycles = [];
  const walk = (id, path) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') { cycles.push([...path, id].join(' → ')); return; }
    state.set(id, 'open');
    for (const d of modules.get(id).deps) walk(d, [...path, id]);
    state.set(id, 'done');
  };
  walk(idOf(ENTRY), []);
  if (cycles.length) {
    console.warn('循環参照:\n  ' + cycles.join('\n  '));
  }
}

// ---- HTML の組み立て ----

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'style.css'), 'utf8');

// <body> の中身だけ取り出す（script タグは除く）
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

// viewport メタが無いと、スマホのブラウザは既定の 980px 幅でレイアウトしてしまい、
// 画面いっぱいに広げるつもりの計算がすべて狂う。
// 自前の <head> を持てない埋め込み先でも効くよう、実行時にも保証しておく。
const viewportGuard = `
if (!document.querySelector('meta[name="viewport"]')) {
  const m = document.createElement('meta');
  m.name = 'viewport';
  m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  document.head.appendChild(m);
}
`;

const registry = `
// --- ちいさなモジュールレジストリ ---
// 各モジュールは関数に包まれている。ローカル変数が互いに衝突しないようにするため。
const __defs = Object.create(null);
const __cache = Object.create(null);
const __def = (id, fn) => { __defs[id] = fn; };
function __req(id) {
  const hit = __cache[id];
  if (hit) return hit;
  const fn = __defs[id];
  if (!fn) throw new Error('モジュールが見つかりません: ' + id);
  const exports = {};
  __cache[id] = exports;   // 循環に備えて先に登録する
  fn(exports, __req);
  return exports;
}
const __reqAsync = (id) => Promise.resolve(__req(id));
`;

const body_ = [...modules.entries()]
  .map(([id, m]) => `__def(${JSON.stringify(id)}, function (__exports, __req) {\n${m.code}\n});`)
  .join('\n\n');

const inner = `<style>
${css}
</style>

${body}

<script>
(function () {
'use strict';
${viewportGuard}
${registry}
${body_}

// エントリを起動する
__req('main.js');
})();
</script>
`;

const out = FRAGMENT ? inner : `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#101018">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="ドットのぼうけん">
<title>ポケットモンスター ― ドットのぼうけん</title>
</head>
<body>
${inner}</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`${modules.size} モジュールを1枚にまとめました`);
console.log(`→ ${relative(ROOT, OUT)}  (${kb} KB)`);
