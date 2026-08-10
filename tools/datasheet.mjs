#!/usr/bin/env node
/**
 * ゲームのデータ一覧ページを src/data/ から生成する。
 *
 *   node tools/datasheet.mjs [出力先]
 *
 * 手で書き写すと必ずズレるので、実データから作る。
 * データを足したら再生成すれば、そのまま最新になる。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'dist/datasheet.html');

const { SPECIES, speciesList } = await import(join(ROOT, 'src/data/species.js'));
const { MOVES } = await import(join(ROOT, 'src/data/moves.js'));
const { ITEMS, POCKETS } = await import(join(ROOT, 'src/data/items.js'));
const { TYPES, CHART, TYPE_COLOR, effectiveness } = await import(join(ROOT, 'src/data/types.js'));
const { MAPS, mapWidth } = await import(join(ROOT, 'src/data/maps/index.js'));
const { TILE } = await import(join(ROOT, 'src/data/tiles.js'));
const { EXP_TYPE_LABEL, CURVE } = await import(join(ROOT, 'src/data/growth.js'));
const { TRAINERS, BADGES, prizeMoney } = await import(join(ROOT, 'src/data/trainers.js'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- データから導ける事実を先に出しておく ----

const learnedSomewhere = new Set();
for (const s of speciesList) for (const e of s.learnset) learnedSomewhere.add(e.move);

const wildIn = {};            // 種族id -> 出現マップ名[]
for (const m of Object.values(MAPS)) {
  for (const e of m.encounters?.table ?? []) (wildIn[e.id] ??= new Set()).add(m.name);
  // 水の中も「野生で出る」うち。ここを見落とすと、つりでしか出ない種が
  // 「入手不可」に見えてしまう。
  for (const e of m.water?.surf?.table ?? []) (wildIn[e.id] ??= new Set()).add(`${m.name}（なみのり）`);
  for (const spot of Object.values(m.water?.fish ?? {})) {
    for (const e of spot.table) (wildIn[e.id] ??= new Set()).add(`${m.name}（つり）`);
  }
}
const evolvesFrom = {};       // 種族id -> 進化元の種族
for (const s of speciesList) if (s.evolution) evolvesFrom[s.evolution.to] = s;

const STARTERS = [1, 4, 7];

/** 交換でもらえる種族 -> どこの誰か。会話データから拾う。 */
const TRADE_SOURCE = {};
for (const m of Object.values(MAPS)) {
  const walk = (lines) => {
    for (const l of lines ?? []) {
      if (typeof l !== 'object' || !l) continue;
      if (l.trade) (TRADE_SOURCE[l.trade.give] ??= []).push({ map: m.name, want: l.trade.want });
      for (const k of ['then', 'else', 'yes', 'no']) if (l[k]) walk(l[k]);
    }
  };
  for (const n of m.npcs ?? []) walk(n.lines);
}

/**
 * 実際に手に入る道具を、マップと会話データから拾い集める。
 * ここを手で書くと配布箇所を足したときに嘘になるので、実データから数える。
 */
const OBTAINABLE_ITEMS = new Set(['モンスターボール', 'きずぐすり']); // 最初から持っているぶん
const ITEM_SOURCE = {};  // 道具名 -> 入手手段の説明[]

for (const name of OBTAINABLE_ITEMS) (ITEM_SOURCE[name] ??= []).push('最初から所持');

for (const m of Object.values(MAPS)) {
  for (const it of m.items ?? []) {
    OBTAINABLE_ITEMS.add(it.item);
    (ITEM_SOURCE[it.item] ??= []).push(`${m.name}に落ちている`);
  }
  // 会話のなかの shop / give を探す（入れ子の then/else/yes/no もたどる）
  const walk = (lines) => {
    for (const l of lines ?? []) {
      if (typeof l !== 'object' || !l) continue;
      if (l.shop) for (const s of l.shop) {
        OBTAINABLE_ITEMS.add(s);
        (ITEM_SOURCE[s] ??= []).push(`${m.name}で購入`);
      }
      if (l.give) {
        OBTAINABLE_ITEMS.add(l.give);
        (ITEM_SOURCE[l.give] ??= []).push(`${m.name}でもらえる`);
      }
      for (const k of ['then', 'else', 'yes', 'no']) if (l[k]) walk(l[k]);
    }
  };
  for (const n of m.npcs ?? []) walk(n.lines);
}

function obtainRoutes(s) {
  const ways = [];
  if (STARTERS.includes(s.id)) ways.push({ kind: 'starter', text: '最初の1匹（3択）' });
  if (wildIn[s.id]) ways.push({ kind: 'wild', text: '野生 ' + [...wildIn[s.id]].join('・') });
  for (const t of TRADE_SOURCE[s.id] ?? []) {
    ways.push({ kind: 'evo', text: `${t.map}で ${SPECIES[t.want].name}と交換` });
  }
  const from = evolvesFrom[s.id];
  if (from) {
    const needsStone = from.evolution.method === 'stone';
    ways.push({
      kind: needsStone && !OBTAINABLE_ITEMS.has(from.evolution.item) ? 'blocked' : 'evo',
      text: needsStone
        ? `${from.name}に${from.evolution.item}`
        : `${from.name} Lv${from.evolution.level}`,
    });
  }
  return ways;
}

/**
 * 通常プレイで到達できるか。
 * 'yes' 必ず取れる ／ 'choice' 御三家の選択しだい ／ 'blocked' 手段が塞がっている。
 * 交換で手に入るものは、交換に出す側が野生で取れるかぎり 'yes' あつかい。
 */
const rootObtainable = (id) => !!wildIn[id] || !!TRADE_SOURCE[id];

function reachable(s) {
  const ways = obtainRoutes(s);
  if (!ways.length) return 'none';
  if (ways.every((w) => w.kind === 'blocked')) return 'blocked';
  if (ways.some((w) => w.kind === 'wild')) return 'yes';
  if (rootObtainable(s.id)) return 'yes';
  if (ways.some((w) => w.kind === 'starter')) return 'choice';

  // 進化のみ：たどっていって根が取れるか
  let cur = s;
  while (evolvesFrom[cur.id]) {
    const from = evolvesFrom[cur.id];
    if (from.evolution.method === 'stone' && !OBTAINABLE_ITEMS.has(from.evolution.item)) return 'blocked';
    cur = from;
    if (rootObtainable(cur.id)) return 'yes';
  }
  return STARTERS.includes(cur.id) ? 'choice' : 'none';
}

// ---- 部品 ----

const typeChip = (t) =>
  `<span class="chip" style="background:${TYPE_COLOR[t]}">${esc(t)}</span>`;

const STAT_LABEL = { hp: 'ＨＰ', atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ' };
const STAT_MAX = 130;   // ギャラドスのこうげき125が最大。バーの目盛りをここに合わせる。

function statBar(key, v) {
  const pct = Math.min(100, (v / STAT_MAX) * 100);
  const color = v >= 90 ? '#4ad14a' : v >= 55 ? '#f0c02a' : '#e04030';
  return `<div class="stat">
    <span class="stat-l">${STAT_LABEL[key]}</span>
    <span class="stat-v">${v}</span>
    <span class="stat-bar"><i style="width:${pct.toFixed(1)}%;background:${color}"></i></span>
  </div>`;
}

/**
 * 到達しやすさのバッジ。
 * 御三家そのものと、その進化形とでは意味が違うので文言を分ける
 * （進化形は「3択」ではなく「選んだ系統でしか手に入らない」）。
 */
function reachBadge(s) {
  const r = reachable(s);
  if (r === 'yes') return '';
  if (r === 'choice') {
    return STARTERS.includes(s.id)
      ? '<span class="badge choice">3択のどれか</span>'
      : '<span class="badge choice">選んだ系統のみ</span>';
  }
  return '<span class="badge blocked">入手不可</span>';
}

// ---- ポケモン ----

const speciesCards = speciesList.map((s) => {
  const total = Object.values(s.base).reduce((a, b) => a + b, 0);
  const evo = s.evolution
    ? (s.evolution.method === 'level'
      ? `Lv${s.evolution.level} で <b>${esc(SPECIES[s.evolution.to].name)}</b>`
      : `<b>${esc(s.evolution.item)}</b> で <b>${esc(SPECIES[s.evolution.to].name)}</b>`)
    : 'しない';

  const learn = s.learnset.map((e) => {
    const mv = MOVES[e.move];
    return `<tr><td class="num">${e.lv === 1 ? '—' : 'Lv' + e.lv}</td>
      <td>${esc(e.move)}</td>
      <td>${typeChip(mv.type)}</td>
      <td class="num">${mv.power || '—'}</td></tr>`;
  }).join('');

  const routes = obtainRoutes(s);
  const routeText = routes.length
    ? routes.map((w) => `<span class="route ${w.kind}">${esc(w.text)}</span>`).join('')
    : '<span class="route blocked">手段なし</span>';

  return `<article class="card mon" id="mon-${s.id}">
    <header class="mon-head">
      <canvas class="sprite" data-sprite="${s.id}" width="24" height="24"></canvas>
      <div class="mon-id">
        <span class="dexno">No.${String(s.id).padStart(3, '0')}</span>
        <h3>${esc(s.name)} ${reachBadge(s)}</h3>
        <div class="types">${s.types.map(typeChip).join('')}</div>
      </div>
      <div class="total"><span>種族値合計</span><b>${total}</b></div>
    </header>

    <p class="dex">${esc(s.dex)}</p>

    <div class="mon-body">
      <div class="stats">${Object.entries(s.base).map(([k, v]) => statBar(k, v)).join('')}</div>
      <div class="mon-meta">
        <dl>
          <dt>しんか</dt><dd>${evo}</dd>
          <dt>入手</dt><dd>${routeText}</dd>
          <dt>捕獲率</dt><dd class="num">${s.catchRate} <span class="hint">（255が最も捕まえやすい）</span></dd>
          <dt>経験値</dt><dd class="num">${s.baseExp} / ${esc(EXP_TYPE_LABEL[s.expType])}</dd>
          <dt>大きさ</dt><dd class="num">${s.height}m ・ ${s.weight}kg</dd>
        </dl>
      </div>
    </div>

    <table class="learn">
      <thead><tr><th>習得</th><th>わざ</th><th>タイプ</th><th>威力</th></tr></thead>
      <tbody>${learn}</tbody>
    </table>
  </article>`;
}).join('');

// ---- 技 ----

const movesByType = TYPES.map((t) => {
  const list = Object.values(MOVES).filter((m) => m.type === t);
  if (!list.length) return '';
  const rows = list.sort((a, b) => (b.power || 0) - (a.power || 0)).map((m) => {
    const eff = m.effect
      ? `${m.effect.kind === 'status' ? m.effect.status + '化' : ''}${m.effect.kind === 'stat' ? (m.effect.target === 'self' ? '自分の' : '相手の') + STAT_LABEL[m.effect.stat] + (m.effect.stages > 0 ? '↑' : '↓') : ''}${m.effect.kind === 'drain' ? '吸収' : ''}${m.effect.kind === 'recoil' ? '反動' : ''}${m.effect.kind === 'flinch' ? 'ひるみ' : ''}${m.effect.kind === 'highCrit' ? '急所↑' : ''}${m.effect.chance && m.effect.chance < 100 ? ` ${m.effect.chance}%` : ''}`
      : '';
    const unlearned = !learnedSomewhere.has(m.name);
    return `<tr class="${unlearned ? 'unused' : ''}">
      <td>${esc(m.name)}${unlearned ? '<span class="badge blocked">誰も覚えない</span>' : ''}</td>
      <td>${esc(m.category)}</td>
      <td class="num">${m.power || '—'}</td>
      <td class="num">${m.accuracy === null ? '必中' : m.accuracy}</td>
      <td class="num">${m.pp}</td>
      <td class="num">${m.priority ? (m.priority > 0 ? '+' + m.priority : m.priority) : '—'}</td>
      <td class="eff">${esc(eff)}</td>
    </tr>`;
  }).join('');
  return `<div class="movegroup">
    <h4>${typeChip(t)} <span class="count">${list.length}</span></h4>
    <table class="moves">
      <thead><tr><th>わざ</th><th>分類</th><th>威力</th><th>命中</th><th>PP</th><th>優先</th><th>追加効果</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}).join('');

// ---- タイプ相性 ----

const EFF_CLASS = { 0: 'e0', 0.5: 'eh', 1: 'e1', 2: 'e2' };
const EFF_TEXT = { 0: '0', 0.5: '½', 1: '', 2: '2' };
const chartRows = TYPES.map((atk) => {
  const cells = TYPES.map((def) => {
    const e = effectiveness(atk, [def]);
    return `<td class="${EFF_CLASS[e]}" title="${esc(atk)}→${esc(def)} ×${e}">${EFF_TEXT[e]}</td>`;
  }).join('');
  return `<tr><th style="background:${TYPE_COLOR[atk]}">${esc(atk)}</th>${cells}</tr>`;
}).join('');

// ---- マップ ----

const mapPanels = Object.values(MAPS).map((m) => {
  const w = mapWidth(m);
  const enc = m.encounters;
  const total = enc ? enc.table.reduce((a, e) => a + e.weight, 0) : 0;

  const encRows = enc ? enc.table.map((e) => {
    const pct = (e.weight / total) * 100;
    return `<tr>
      <td><canvas class="sprite sm" data-sprite="${e.id}" width="24" height="24"></canvas>${esc(SPECIES[e.id].name)}</td>
      <td class="num">Lv${e.min}–${e.max}</td>
      <td class="num">${pct.toFixed(0)}%</td>
      <td><span class="ratebar"><i style="width:${pct}%"></i></span></td>
    </tr>`;
  }).join('') : '';

  // マップの見た目をそのまま出す（タイル記号の並びが地形そのもの）
  const preview = m.tiles.map((row) => [...row].map((ch) => {
    const t = TILE[m.legend[ch]];
    const cls = t?.water ? 'w' : t?.ledge ? 'l' : t?.grass ? 'g' : t?.solid ? 's' : 'p';
    return `<i class="${cls}"></i>`;
  }).join('')).join('<br>');

  const waterRows = (table) => table.map((e) => {
    const pct = (e.weight / table.reduce((a, x) => a + x.weight, 0)) * 100;
    return `<tr>
      <td><canvas class="sprite sm" data-sprite="${e.id}" width="24" height="24"></canvas>${esc(SPECIES[e.id].name)}</td>
      <td class="num">Lv${e.min}–${e.max}</td>
      <td class="num">${pct.toFixed(0)}%</td>
      <td><span class="ratebar"><i style="width:${pct}%"></i></span></td>
    </tr>`;
  }).join('');

  const water = m.water ? `
    ${m.water.surf ? `<p class="rate">なみのり中は 1歩あたり <b>${m.water.surf.rate}%</b> で遭遇</p>
      <table class="enc"><tbody>${waterRows(m.water.surf.table)}</tbody></table>` : ''}
    ${Object.entries(m.water.fish ?? {}).map(([power, spot]) => `
      <p class="rate">つりざお${power === '1' ? '（ボロ）' : '（いい）'}は <b>${spot.chance}%</b> でかかる</p>
      <table class="enc"><tbody>${waterRows(spot.table)}</tbody></table>`).join('')}` : '';

  return `<article class="card map">
    <header class="map-head">
      <h3>${esc(m.name)}</h3>
      <span class="size num">${w} × ${m.tiles.length} タイル</span>
    </header>
    <div class="map-body">
      <div class="preview" aria-hidden="true">${preview}</div>
      <div class="map-info">
        ${enc
      ? `<p class="rate">草むら1歩あたり <b>${enc.rate}%</b> で遭遇</p>
             <table class="enc"><tbody>${encRows}</tbody></table>`
      : '<p class="rate none">野生ポケモンは出ない</p>'}
        ${water}
        <dl class="links">
          <dt>出口</dt><dd>${(m.warps ?? []).length
      ? [...new Set(m.warps.map((x) => MAPS[x.to].name))].map((n) => `<span class="route evo">${esc(n)}</span>`).join('')
      : 'なし'}</dd>
          <dt>人</dt><dd>${(m.npcs ?? []).length}人（うち トレーナー ${(m.npcs ?? []).filter((n) => n.trainer).length}人） ・ 看板 ${(m.signs ?? []).length}</dd>
          ${m.fly ? `<dt>そらをとぶ</dt><dd><span class="route evo">${esc(m.fly.label)}</span></dd>` : ''}
          <dt>落ちもの</dt><dd>${(m.items ?? []).length
      ? (m.items ?? []).map((it) => `<span class="route evo">${esc(it.item)}${it.n > 1 ? `×${it.n}` : ''}</span>`).join('')
      : 'なし'}</dd>
        </dl>
      </div>
    </div>
  </article>`;
}).join('');

// ---- どうぐ ----

const itemRows = POCKETS.map((p) => {
  const list = Object.values(ITEMS).filter((i) => i.pocket === p);
  const rows = list.map((i) => {
    const ways = ITEM_SOURCE[i.name] ?? [];
    // 同じ手段が複数マップにあっても意味は同じなので重複は畳む
    const where = [...new Set(ways)].map((w) => `<span class="route evo">${esc(w)}</span>`).join('');
    return `<tr class="${ways.length ? '' : 'unused'}">
      <td>${esc(i.name)}${ways.length ? '' : '<span class="badge blocked">入手不可</span>'}</td>
      <td class="eff">${esc(i.desc)}</td>
      <td class="num">${i.price ?? '—'}</td>
      <td>${where || '<span class="hint">配布箇所なし</span>'}</td>
    </tr>`;
  }).join('');
  return `<div class="movegroup">
    <h4><span class="chip" style="background:#6a6a78">${esc(p)}</span> <span class="count">${list.length}</span></h4>
    <table class="moves"><thead><tr><th>なまえ</th><th>せつめい</th><th>ねだん</th><th>入手</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`;
}).join('');

// ---- トレーナー ----

// どのマップに立っているか、視線が何マス届くかは、マップ側にしか書いていない
const trainerPlace = {};
for (const m of Object.values(MAPS)) {
  for (const n of m.npcs ?? []) {
    if (!n.trainer) continue;
    trainerPlace[n.trainer] = {
      map: m.name,
      sight: n.sight ?? TRAINERS[n.trainer]?.sight ?? 0,
      dir: { up: '↑', down: '↓', left: '←', right: '→' }[n.dir] ?? '',
    };
  }
}

const trainerCards = Object.entries(TRAINERS).map(([id, t]) => {
  const place = trainerPlace[id];
  const party = t.party.map((p) => {
    const s = SPECIES[p.id];
    return `<tr>
      <td><canvas class="sprite sm" data-sprite="${p.id}" width="24" height="24"></canvas>${esc(s.name)}</td>
      <td>${s.types.map(typeChip).join('')}</td>
      <td class="num">Lv${p.lv}</td></tr>`;
  }).join('');

  return `<article class="card map">
    <header class="map-head">
      <h3>${esc(t.class)} ${esc(t.name)}${t.badge ? ' <span class="badge choice">ジムリーダー</span>' : ''}</h3>
      <span class="size num">しょうきん ${prizeMoney(t)}</span>
    </header>
    <div class="map-body">
      <div class="map-info" style="flex:1">
        <table class="enc"><tbody>${party}</tbody></table>
        <dl class="links">
          <dt>いる場所</dt><dd>${place ? esc(place.map) : '<span class="route blocked">未配置</span>'}</dd>
          <dt>視線</dt><dd>${place?.sight
      ? `${place.dir} ${place.sight}マス`
      : '<span class="hint">なし（話しかけると勝負）</span>'}</dd>
          ${t.badge ? `<dt>バッジ</dt><dd><span class="route evo">${esc(BADGES.find((b) => b.id === t.badge)?.name ?? t.badge)}</span></dd>` : ''}
        </dl>
      </div>
    </div>
  </article>`;
}).join('');

const badgeRows = BADGES.map((b) => `<tr>
  <td><span class="chip" style="background:${b.color};color:#202028">${esc(b.name)}</span></td>
  <td>${esc(b.from)}</td>
  <td class="eff">${esc(b.effect)}</td>
</tr>`).join('');

// ---- スプライトのピクセルデータを埋め込む ----
const spriteData = Object.fromEntries(
  speciesList.map((s) => [s.id, { p: s.sprite.palette, x: s.sprite.pixels }]),
);

// ---- 集計 ----
const counts = {
  species: speciesList.length,
  moves: Object.keys(MOVES).length,
  items: Object.keys(ITEMS).length,
  maps: Object.keys(MAPS).length,
  types: TYPES.length,
  trainers: Object.keys(TRAINERS).length,
  reachable: speciesList.filter((s) => ['yes', 'choice'].includes(reachable(s))).length,
  oneRun: Math.round(speciesList.filter((s) => reachable(s) === 'yes').length
    + speciesList.filter((s) => reachable(s) === 'choice').length / 3),
  unlearned: Object.keys(MOVES).length - learnedSomewhere.size,
  gotItems: Object.values(ITEMS).filter((i) => ITEM_SOURCE[i.name]).length,
};

/**
 * 「いまの穴」は手で書くと直し忘れて嘘になる。
 * 実データから毎回数え直して、埋まった項目は自然に消えるようにする。
 */
const gaps = [];

const unreachable = speciesList.filter((s) => ['blocked', 'none'].includes(reachable(s)));
if (unreachable.length) {
  const need = [...new Set(unreachable.flatMap((s) => {
    const from = evolvesFrom[s.id];
    return from?.evolution.method === 'stone' && !OBTAINABLE_ITEMS.has(from.evolution.item)
      ? [from.evolution.item] : [];
  }))];
  gaps.push({
    h: `${unreachable.map((s) => s.name).join('・')} に到達できない`,
    p: need.length
      ? `進化に必要な <b>${need.map(esc).join('・')}</b> を配っている場所が、落ちものにも
         ショップにもありません。`
      : '野生にも進化にも登場しないので、通常プレイでは手に入りません。',
  });
}

const missingItems = Object.values(ITEMS).filter((i) => !ITEM_SOURCE[i.name]);
if (missingItems.length) {
  gaps.push({
    h: `どうぐは ${counts.items} 個中 ${counts.gotItems} 個しか手に入らない`,
    p: `<b>${missingItems.map((i) => esc(i.name)).join('・')}</b> は、定義はあるのに
        落ちてもいないし売ってもいません。`,
  });
}

const choiceOnly = speciesList.filter((s) => reachable(s) === 'choice');
if (choiceOnly.length) {
  gaps.push({
    h: `1周で取れるのは ${counts.species} 種のうち ${counts.oneRun} 種`,
    p: `御三家は3体から1体しか選べないので、残り2系統の ${choiceOnly.length - choiceOnly.length / 3} 種は
        1周では埋まりません。交換相手もいないので、図鑑を全部埋める手段が今はありません。`,
  });
}

const unlearnedMoves = Object.values(MOVES).filter((m) => !learnedSomewhere.has(m.name));
if (unlearnedMoves.length) {
  gaps.push({
    h: `${unlearnedMoves.length}つのわざを誰も覚えない`,
    p: `18タイプすべてを技データで網羅するために作ったものの、その技を覚える種族を
        入れていないためです（${unlearnedMoves.map((m) => esc(m.name)).join('・')}）。`,
  });
}

const gapCards = gaps.length
  ? gaps.map((g) => `<div class="gap"><h3>${g.h}</h3><p>${g.p}</p></div>`).join('')
  : '<div class="gap"><h3>いまのところ穴はありません</h3><p>データ上は、全部のポケモンとどうぐに'
    + '入手経路があります。</p></div>';

const css = readFileSync(join(ROOT, 'tools/datasheet.css'), 'utf8');

// charset は先頭1024バイト以内にあればブラウザが拾う。
// 記事として配信するときはラッパ側が head を用意するが、
// dist/datasheet.html を直接開いたときに文字化けしないようにここでも宣言しておく。
const html = `<meta charset="utf-8">
<style>
${css}
</style>

<div class="sheet">
<header class="top">
  <p class="eyebrow">データ資料</p>
  <h1>ポケットモンスター ― ドットのぼうけん</h1>
  <p class="lede">いま <code>src/data/</code> に入っている中身をそのまま並べたものです。
  このページは実データから生成しているので、値の書き写し間違いはありません。</p>
  <ul class="counts">
    <li><b>${counts.species}</b><span>ポケモン</span></li>
    <li><b>${counts.moves}</b><span>わざ</span></li>
    <li><b>${counts.items}</b><span>どうぐ</span></li>
    <li><b>${counts.maps}</b><span>マップ</span></li>
    <li><b>${counts.types}</b><span>タイプ</span></li>
    <li><b>${counts.trainers}</b><span>トレーナー</span></li>
  </ul>
  <nav class="nav">
    <a href="#s-gap">いまの穴</a>
    <a href="#s-mon">ポケモン</a>
    <a href="#s-move">わざ</a>
    <a href="#s-type">タイプ相性</a>
    <a href="#s-map">マップ</a>
    <a href="#s-trainer">トレーナー</a>
    <a href="#s-item">どうぐ</a>
    <a href="#s-calc">計算式</a>
  </nav>
</header>

<section id="s-gap">
  <h2>いまの穴</h2>
  <p class="note">データを突き合わせて分かった、いま遊べない部分です。バグではなく、作り込みが
  そこまで届いていないところです。</p>
  <div class="gaps">${gapCards}</div>
</section>

<section id="s-mon">
  <h2>ポケモン <span class="count">${counts.species}種</span></h2>
  <p class="note">種族値は個体ごとの能力の土台です。実際の数値はここに個体値（0〜31、捕まえた時に確定）と
  レベルが乗ります。バーの色は数値の大きさの目安で、赤→黄→緑の順に高くなります。</p>
  <div class="grid">${speciesCards}</div>
</section>

<section id="s-move">
  <h2>わざ <span class="count">${counts.moves}個</span></h2>
  <p class="note">タイプごとにまとめています。「優先」が付いた技は素早さに関係なく先に出ます。
  分類が「変化」の技はダメージを与えず、状態や能力だけを変えます。</p>
  ${movesByType}
</section>

<section id="s-type">
  <h2>タイプ相性</h2>
  <p class="note">縦が攻撃側、横が防御側です。空欄は等倍。2つのタイプを持つ相手には両方が掛け算されるので、
  最大4倍・最小0倍になります。</p>
  <div class="chartwrap">
    <table class="chart">
      <thead><tr><th class="corner">攻↓ 防→</th>${TYPES.map((t) => `<th style="background:${TYPE_COLOR[t]}"><span>${esc(t)}</span></th>`).join('')}</tr></thead>
      <tbody>${chartRows}</tbody>
    </table>
  </div>
  <p class="legend"><span class="e2">2</span> ばつぐん　<span class="eh">½</span> いまひとつ　<span class="e0">0</span> 効果なし</p>
</section>

<section id="s-map">
  <h2>マップ <span class="count">${counts.maps}枚</span></h2>
  <p class="note">左の図はマップそのものの形です（緑＝草むら、灰＝通れない、青＝水、薄茶＝歩ける道、
  くすんだ灰＝段差）。段差は北から南へ飛び降りるだけの一方通行で、逆からは登れません。
  水は なみのり を おぼえたポケモンがいるときだけ渡れます。</p>
  <div class="grid maps">${mapPanels}</div>
</section>

<section id="s-trainer">
  <h2>トレーナー <span class="count">${Object.keys(TRAINERS).length}人</span></h2>
  <p class="note">向いている方向にプレイヤーが入ると、視線が届く範囲なら勝負を仕掛けてきます。
  壁や他の人が手前にいると、そこで視線は止まります。一度倒した相手は二度と仕掛けてきません。
  しょうきんは <b>係数 × 最後に出すポケモンのレベル</b> です。</p>
  <div class="grid maps">${trainerCards}</div>

  <h3 style="margin-top:1.4rem">ジムバッジ</h3>
  <table class="moves">
    <thead><tr><th>バッジ</th><th>どこで</th><th>もらえると</th></tr></thead>
    <tbody>${badgeRows}</tbody>
  </table>
</section>

<section id="s-item">
  <h2>どうぐ <span class="count">${counts.items}個</span></h2>
  <p class="note">「入手」は落ちている場所とショップの品揃えから数えたものです。
  売値は買値の半分（切り捨て）になります。</p>
  ${itemRows}
</section>

<section id="s-calc">
  <h2>数値の決まりかた</h2>
  <div class="formulas">
    <div class="formula">
      <h3>ステータス</h3>
      <pre>HP   = ⌊(種族値×2 + 個体値) × Lv ÷ 100⌋ + Lv + 10
その他 = ⌊(種族値×2 + 個体値) × Lv ÷ 100⌋ + 5</pre>
      <p>個体値は0〜31で、捕まえた瞬間に6つとも決まります。努力値と性格は入れていません。</p>
    </div>
    <div class="formula">
      <h3>ダメージ</h3>
      <pre>基礎 = ⌊⌊⌊(2×Lv÷5 + 2) × 威力 × 攻撃 ÷ 防御⌋ ÷ 50⌋⌋ + 2
× 急所1.5 × やけど0.5 × タイプ一致1.5 × 相性 × 乱数(85〜100%)</pre>
      <p>急所は1/16（「急所に当たりやすい」技は1/8）。相性が0でなければ最低1は入ります。</p>
    </div>
    <div class="formula">
      <h3>捕獲</h3>
      <pre>a = ⌊(最大HP×3 − 現在HP×2) × 捕獲率 × ボール補正 ÷ (最大HP×3)⌋ × 状態異常補正
b = 1048560 ÷ √√(16711680 ÷ a)
0〜65535 の乱数が b 未満なら1回揺れる。4回揺れれば成功。</pre>
      <p>状態異常補正は ねむり・こおり が2倍、まひ・どく・やけど が1.5倍。
      HPを削るほど、状態異常にするほど捕まえやすくなります。</p>
    </div>
    <div class="formula">
      <h3>経験値</h3>
      <pre>もらえる経験値 = ⌊倒した相手の基礎経験値 × 相手のLv ÷ 7⌋</pre>
      <p>次のレベルに必要な累計経験値は成長タイプで決まります（Lv50時点）：
      ${Object.entries(CURVE).map(([k, f]) => `${EXP_TYPE_LABEL[k]} ${f(50).toLocaleString()}`).join(' ／ ')}</p>
    </div>
  </div>
</section>

<footer class="foot">
  <p>このページは <code>node tools/datasheet.mjs</code> で <code>src/data/</code> から生成しています。
  データを足したら作り直せば最新になります。</p>
  <p class="fine">個人の学習用に作ったファン作品です。画像・音声などの著作物は使っておらず、
  ドット絵はすべてコードから生成しています。</p>
</footer>
</div>

<script>
// ゲーム本体と同じピクセルデータからスプライトを描く。
// 資料に載っている姿と、実際に画面に出る姿がズレないようにするため。
const SPRITES = ${JSON.stringify(spriteData)};
for (const cv of document.querySelectorAll('canvas[data-sprite]')) {
  const def = SPRITES[cv.dataset.sprite];
  if (!def) continue;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(24, 24);
  for (let y = 0; y < def.x.length; y++) {
    for (let x = 0; x < def.x[y].length; x++) {
      const col = def.p[def.x[y][x]];
      if (!col) continue;
      const i = (y * 24 + x) * 4;
      img.data[i]     = parseInt(col.slice(1, 3), 16);
      img.data[i + 1] = parseInt(col.slice(3, 5), 16);
      img.data[i + 2] = parseInt(col.slice(5, 7), 16);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, 'utf8');
console.log(`データ資料を生成しました → ${relative(ROOT, OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
console.log(`  ポケモン ${counts.species} / わざ ${counts.moves} / どうぐ ${counts.items} / マップ ${counts.maps}`);
