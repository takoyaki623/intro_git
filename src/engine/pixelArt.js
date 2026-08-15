// ドット絵の実体。
//
// スプライトは「1文字=1ピクセル」の文字列配列 + パレットで書く。
// 差分が読めるし、どのエディタでも手で直せるし、JS のファイル内でよく縮む。
//
//   { palette: { '.': null, 'o': '#e8703a' },
//     pixels: [ '..oo..', '.oooo.' ] }
//
// 描画のたびに1ピクセルずつ塗るのは論外なので、初回に一度だけ
// オフスクリーン canvas へ焼いて（bake）以降は drawImage 1発で済ませる。

import { mulberry32 } from '../core/rng.js';

const cache = new WeakMap();

/** 定義を canvas に焼く。被弾フラッシュ用の白シルエットも同時に作る。 */
export function bake(def) {
  const hit = cache.get(def);
  if (hit) return hit;

  const h = def.pixels.length;
  const w = def.pixels[0].length;

  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  const cv = make();
  const wv = make();
  const cctx = cv.getContext('2d');
  const wctx = wv.getContext('2d');
  const img = cctx.createImageData(w, h);
  const wimg = wctx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const row = def.pixels[y];
    for (let x = 0; x < w; x++) {
      const col = def.palette[row[x]];
      if (!col) continue;
      const i = (y * w + x) * 4;
      img.data[i] = parseInt(col.slice(1, 3), 16);
      img.data[i + 1] = parseInt(col.slice(3, 5), 16);
      img.data[i + 2] = parseInt(col.slice(5, 7), 16);
      img.data[i + 3] = 255;
      wimg.data[i] = wimg.data[i + 1] = wimg.data[i + 2] = wimg.data[i + 3] = 255;
    }
  }

  cctx.putImageData(img, 0, 0);
  wctx.putImageData(wimg, 0, 0);

  const out = { canvas: cv, white: wv, w, h };
  cache.set(def, out);
  return out;
}

export function sizeOf(def) {
  return { w: def.pixels[0].length, h: def.pixels.length };
}

/**
 * スプライトを描く。
 * flip  : 左右反転（背面スプライトを描かずに済ませるため）
 * flash : 白シルエットで描く（被弾・進化演出）
 * alpha : 透明度
 */
export function draw(ctx, def, x, y, opt = {}) {
  const { scale = 1, flip = false, flash = false, alpha = 1, clipH = null } = opt;
  const s = bake(def);
  const src = flash ? s.white : s.canvas;

  const sh = clipH === null ? s.h : Math.max(0, Math.min(s.h, clipH));
  if (sh <= 0 || alpha <= 0) return;

  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) {
    ctx.translate(s.w * scale, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0, s.w, sh, 0, 0, s.w * scale, sh * scale);
  ctx.restore();
}

// ---- プレースホルダ ----
// 種族を追加したとき、実スプライトを描き終わるまで開発を止めないための逃げ道。
// id から決定論的にシルエットを作るので、同じ種族は常に同じ形になる。
// いまの 51種はすべて sprites/monsters.js の手描きに差し替え済みで、
// ここを使っているのは読み込み失敗時のフォールバックだけ。
//
// archetype で胴体プランを選べる（'quadruped'|'bird'|'humanoid'|'dragon'|'ghost'|'insect'|'blob'）。
// 色だけを変えたブロブを量産すると全員同じ生き物に見えてしまうので、
// next の1体を足すときは見た目のモチーフに合う archetype を指定すること。

const placeholders = new Map();

export function placeholderSprite(id, color = '#8888cc', size = 24, archetype = 'blob') {
  const key = id + '|' + color + '|' + size + '|' + archetype;
  const hit = placeholders.get(key);
  if (hit) return hit;

  const r = mulberry32((id * 2654435761) >>> 0);
  const half = Math.ceil(size / 2);
  const grid = Array.from({ length: size }, () => new Array(size).fill('.'));
  const cx = (size - 1) / 2;

  /** 左右対称に1点置く（x は中心からの左半分だけ渡す） */
  const setSym = (x, y, ch) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (yi < 0 || yi >= size || xi < 0 || xi >= half) return;
    grid[yi][xi] = ch;
    grid[yi][size - 1 - xi] = ch;
  };
  /** 非対称に1点だけ置く（尻尾など、片側にしか無いパーツ用） */
  const setPt = (x, y, ch) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (yi < 0 || yi >= size || xi < 0 || xi >= size) return;
    grid[yi][xi] = ch;
  };
  /** 中心 (cx,cy) 半径 (rx,ry) の楕円を左右対称に塗りつぶす。ふちはノイズで少し削る。 */
  const fillOval = (cy, rx, ry, { noisy = true, threshold = 1.15 } = {}) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < half; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > threshold) continue;
        if (noisy && d > 0.75 && r.chance(0.4)) continue;
        setSym(x, y, d < 0.35 ? 'l' : 'b');
      }
    }
  };
  const line = (x, y0, y1, ch = 'b') => {
    const [a, b] = y0 <= y1 ? [y0, y1] : [y1, y0];
    for (let y = a; y <= b; y++) setSym(x, y, ch);
  };

  if (archetype === 'quadruped') {
    // 横に広い胴体（輪郭はなめらか）+ 立った耳 + 太い4本脚 + 片側にしっぽ。ヒツジやネズミ系のモチーフ。
    const bodyCy = size * 0.48;
    const rx = size * (0.34 + r.next() * 0.05);
    const ry = size * (0.20 + r.next() * 0.04);
    fillOval(bodyCy, rx, ry, { noisy: false });
    // 耳（先のとがった三角、太さ2px）
    const earX = cx - rx * (0.55 + r.next() * 0.15);
    const earTop = Math.round(bodyCy - ry) - r.int(4, 6);
    line(earX, earTop, bodyCy - ry, 'b');
    line(earX - 1, earTop + 1, bodyCy - ry, 'b');
    // 脚（前後2対、太さ2pxでしっかり下に伸ばす）
    const legTop = bodyCy + ry * 0.5;
    const legBot = Math.min(size - 1, legTop + r.int(4, 6));
    for (const lx of [cx - rx * 0.75, cx - rx * 0.75 - 1, cx - rx * 0.2, cx - rx * 0.2 - 1]) {
      line(lx, legTop, legBot, 'o');
    }
    // しっぽ（右側にだけ、くるんと1本、太め）
    const tailLen = r.int(4, 7);
    let tx = size - 1 - Math.round(cx - rx * 0.9);
    let ty = bodyCy - ry * 0.2;
    for (let i = 0; i < tailLen; i++) {
      setPt(tx, ty, 'b');
      setPt(tx, ty + 1, 'b');
      tx += r.chance(0.6) ? 1 : 0;
      ty -= 1;
    }
    setSym(cx - rx * 0.5, bodyCy - ry * 0.25, 'e');
  } else if (archetype === 'bird') {
    // 縦長の卵形の胴体（輪郭はなめらか）+ くちばし + 広げぎみの翼 + 細い2本脚。トリ系のモチーフ。
    const bodyCy = size * 0.42;
    const rx = size * (0.22 + r.next() * 0.03);
    const ry = size * (0.32 + r.next() * 0.04);
    fillOval(bodyCy, rx, ry, { noisy: false });
    // くちばし（顔の下に小さく飛び出す三角、はっきり見えるよう2px）
    const beakY = Math.round(bodyCy + ry * 0.4);
    setSym(cx - 0.5, beakY, 'o');
    setSym(cx - 0.5, beakY + 1, 'o');
    setSym(cx - 1.5, beakY, 'o');
    // 翼（胴体の脇に大きく広げた三角、2〜3px幅で塗る）
    const wingY0 = Math.round(bodyCy - ry * 0.2);
    const wingSpan = r.int(6, 9);
    for (let i = 0; i < wingSpan; i++) {
      const y = wingY0 + i;
      const reach = Math.max(1, Math.round((wingSpan - i) * 0.5));
      for (let k = 0; k < reach; k++) setSym(cx - rx - k, y, 'l');
    }
    // 脚
    const legTop = bodyCy + ry * 0.9;
    const legBot = Math.min(size - 1, legTop + r.int(3, 5));
    line(cx - rx * 0.3, legTop, legBot, 'o');
    setSym(cx - rx * 0.35, bodyCy - ry * 0.4, 'e');
  } else if (archetype === 'humanoid') {
    // 頭(胴体と別の円) + ほそい胴体 + 腕 + 脚。エスパー・かくとう系のモチーフ。
    const headCy = size * 0.28;
    const headR = size * (0.16 + r.next() * 0.03);
    fillOval(headCy, headR, headR, { threshold: 1.05 });
    // 角/耳
    if (r.chance(0.7)) line(cx - headR * 0.6, headCy - headR - r.int(2, 4), headCy - headR, 'l');
    // 胴体
    const bodyCy = size * 0.62;
    const rx = size * (0.14 + r.next() * 0.03);
    const ry = size * (0.22 + r.next() * 0.03);
    fillOval(bodyCy, rx, ry);
    // 腕
    const armY = Math.round(bodyCy - ry * 0.4);
    setSym(cx - rx - 1, armY, 'l');
    setSym(cx - rx - 2, armY + r.int(1, 3), 'l');
    // 脚
    const legTop = bodyCy + ry * 0.9;
    const legBot = Math.min(size - 1, legTop + r.int(3, 5));
    line(cx - rx * 0.45, legTop, legBot, 'o');
    setSym(cx - headR * 0.4, headCy, 'e');
  } else if (archetype === 'dragon') {
    // 中心の胴体から、細い首と小さな頭が2〜3本のびる。複数の頭を持つ竜のモチーフ。
    const bodyCy = size * 0.62;
    const rx = size * (0.26 + r.next() * 0.04);
    const ry = size * (0.24 + r.next() * 0.04);
    fillOval(bodyCy, rx, ry);
    const heads = r.chance(0.5) ? 3 : 2;
    const innerX = cx - rx * 0.4;
    const outerX = Math.max(0, cx - rx * 0.95);
    const positions = heads === 3 ? [cx - 0.5, innerX, outerX] : [innerX, outerX];
    for (const hx of positions) {
      const neckTop = bodyCy - ry - r.int(4, 7);
      line(hx, neckTop, bodyCy - ry, 'l');
      setPt(Math.round(hx), Math.round(neckTop) - 1, 'b');
      setPt(Math.round(size - 1 - hx), Math.round(neckTop) - 1, 'b');
      setSym(hx, neckTop - 1, 'e');
    }
  } else if (archetype === 'ghost') {
    // 脚のない、下ふちがギザギザした浮遊シルエット。ゴースト・ほのお系のモチーフ。
    const bodyCy = size * 0.48;
    const rx = size * (0.28 + r.next() * 0.05);
    const ry = size * (0.26 + r.next() * 0.05);
    fillOval(bodyCy, rx, ry, { noisy: false });
    // 下ふちを炎/裾のようにギザギザに削る
    const hemY = Math.round(bodyCy + ry * 0.6);
    for (let x = 0; x < half; x++) {
      if (!r.chance(0.5)) continue;
      const depth = r.int(1, 3);
      for (let d = 0; d < depth; d++) setSym(x, hemY + d, '.');
    }
    // 頭の上のゆらぎ（片側だけ、非対称）
    const flameLen = r.int(2, 4);
    let fx = cx - rx * 0.3;
    let fy = bodyCy - ry;
    for (let i = 0; i < flameLen; i++) { setPt(Math.round(fx), Math.round(fy) - i, 'l'); fx += r.chance(0.5) ? 1 : -1; }
    setSym(cx - rx * 0.35, bodyCy - ry * 0.2, 'e');
  } else if (archetype === 'insect') {
    // 大小の楕円を縦に3つ積んだ節のある胴体 + 触角 + 3対の脚。むし系のモチーフ。
    const segs = [
      { cy: size * 0.68, rx: size * 0.26, ry: size * 0.18 },
      { cy: size * 0.48, rx: size * 0.20, ry: size * 0.15 },
      { cy: size * 0.30, rx: size * 0.15, ry: size * 0.13 },
    ];
    for (const s of segs) fillOval(s.cy, s.rx, s.ry, { noisy: false });
    // 触角
    const antTop = segs[2].cy - segs[2].ry - r.int(3, 5);
    line(cx - segs[2].rx * 0.5, antTop, segs[2].cy - segs[2].ry, 'l');
    // 脚（3対、胴体の両脇に斜めの線）
    for (let i = 0; i < 3; i++) {
      const s = segs[Math.min(1, i)];
      const legY = s.cy;
      setSym(cx - s.rx - 1 - i, legY - 1 + i, 'o');
    }
    setSym(cx - segs[2].rx * 0.45, segs[2].cy, 'e');
  } else {
    // 既定: 中央の楕円 + 頭のでっぱり数本（未分類の種族むけの汎用ブロブ）
    const bodyCy = size * 0.56;
    const rx = size * 0.30;
    const ry = size * 0.34;
    fillOval(bodyCy, rx, ry);
    const bumps = r.int(2, 3);
    for (let i = 0; i < bumps; i++) {
      const bx = r.int(1, half - 2);
      const bh = r.int(2, 4);
      const top = Math.max(0, Math.round(bodyCy - ry) - bh);
      line(bx, top, Math.round(bodyCy - ry), 'b');
    }
    setSym(cx - rx * 0.5, bodyCy - ry * 0.35, 'e');
  }

  // 輪郭線（塗りの外周を暗い色に）
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === '.') continue;
      const edge = y === 0 || x === 0 || y === size - 1 || x === size - 1
        || grid[y - 1]?.[x] === '.' || grid[y + 1]?.[x] === '.'
        || grid[y][x - 1] === '.' || grid[y][x + 1] === '.';
      if (edge && grid[y][x] !== 'e') grid[y][x] = 'o';
    }
  }

  const def = {
    palette: {
      '.': null,
      'o': shade(color, -0.55),
      'b': color,
      'l': shade(color, 0.25),
      'e': '#201018',
    },
    pixels: grid.map((row) => row.join('')),
  };

  placeholders.set(key, def);
  return def;
}

/** 16進色を明るく(+)／暗く(-)する。amount は -1..1 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = amount < 0 ? 0 : 255;
    const a = Math.abs(amount);
    return Math.round(v + (t - v) * a);
  });
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---- 色違い（Phase Z-3） ----
// pixelArt.js が既にパレット方式なので、パレットの色相を回すだけで別バリエーションになる。

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 16進色の色相を deg 度だけ回す。彩度・明度はそのまま。 */
function rotateHue(hex, deg) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + deg + 360) % 360, s, l);
}

const shinyCache = new WeakMap();

/**
 * 色違い版のスプライト定義を作る。パレットの色相を90度回すだけ。
 * 同じ def には同じ結果を毎回返す（bake() のキャッシュと相性がいいように）。
 */
export function shinyVariant(def) {
  const hit = shinyCache.get(def);
  if (hit) return hit;
  const palette = {};
  for (const [ch, col] of Object.entries(def.palette)) {
    palette[ch] = col ? rotateHue(col, 90) : col;
  }
  const out = { palette, pixels: def.pixels };
  shinyCache.set(def, out);
  return out;
}
