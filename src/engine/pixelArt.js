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
// 18種ぶんのドット絵を描き終わるまで開発を止めないための逃げ道。
// id から決定論的に左右対称のシルエットを作るので、同じ種族は常に同じ形になる。

const placeholders = new Map();

export function placeholderSprite(id, color = '#8888cc', size = 24) {
  const key = id + '|' + color + '|' + size;
  const hit = placeholders.get(key);
  if (hit) return hit;

  const r = mulberry32((id * 2654435761) >>> 0);
  const half = Math.ceil(size / 2);
  const grid = Array.from({ length: size }, () => new Array(size).fill('.'));

  // 中央に楕円の胴体を置き、その内側だけをノイズで削る。
  // 完全ランダムだと「生き物」に見えないので、輪郭は必ず閉じた塊にする。
  const cx = (size - 1) / 2;
  const cy = size * 0.56;
  const rx = size * 0.30;
  const ry = size * 0.34;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < half; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1.15) continue;
      if (d > 0.75 && r.chance(0.45)) continue;
      const ch = d < 0.35 ? 'l' : 'b';
      grid[y][x] = ch;
      grid[y][size - 1 - x] = ch;
    }
  }

  // 頭のでっぱりを2〜3本
  const bumps = r.int(2, 3);
  for (let i = 0; i < bumps; i++) {
    const bx = r.int(1, half - 2);
    const bh = r.int(2, 4);
    const top = Math.max(0, Math.round(cy - ry) - bh);
    for (let y = top; y < top + bh + 1; y++) {
      if (y < 0 || y >= size) continue;
      grid[y][bx] = 'b';
      grid[y][size - 1 - bx] = 'b';
    }
  }

  // 目
  const ey = Math.round(cy - ry * 0.35);
  const ex = Math.max(1, Math.round(cx - rx * 0.5));
  if (grid[ey]) {
    grid[ey][ex] = 'e';
    grid[ey][size - 1 - ex] = 'e';
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
