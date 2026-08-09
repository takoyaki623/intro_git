// 日本語のドット文字。
//
// 日本語Webフォントを同梱すると数MBになるし「外部アセットなし」の方針に反する。
// かといって3倍に拡大された canvas へ fillText すると滲んで台無しになる。
//
// そこで、必要になった文字だけを 12px で一度だけ焼き、アルファを2値化して
// 1bit のマスクにする。基準解像度で等倍 blit するのでエッジは硬いまま。
// 漢字はシステムフォントから来るので作字コストはゼロ。

const SIZE = 12;
const CELL = 16;
const FONT = `${SIZE}px "Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP","IPAGothic","IPAPGothic","MS Gothic","TakaoGothic",monospace`;

export const LINE_H = 14;
export const FULL_W = 12; // 全角
export const HALF_W = 6;  // 半角

const glyphs = new Map();
let mctx = null;

function measureCtx() {
  if (mctx) return mctx;
  const c = document.createElement('canvas');
  c.width = CELL;
  c.height = CELL;
  mctx = c.getContext('2d', { willReadFrequently: true });
  return mctx;
}

function bakeGlyph(ch) {
  const m = measureCtx();
  m.clearRect(0, 0, CELL, CELL);
  m.font = FONT;
  m.textBaseline = 'alphabetic';
  m.fillStyle = '#fff';
  m.fillText(ch, 1, SIZE);

  const adv = m.measureText(ch).width > SIZE * 0.7 ? FULL_W : HALF_W;

  const d = m.getImageData(0, 0, CELL, CELL);
  // アルファを2値化して白マスクにする。着色は描画時に行う。
  for (let i = 0; i < d.data.length; i += 4) {
    const on = d.data[i + 3] > 110;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = on ? 255 : 0;
  }

  const cv = document.createElement('canvas');
  cv.width = CELL;
  cv.height = CELL;
  cv.getContext('2d').putImageData(d, 0, 0);

  // マスクに任意色を乗せた版をキャッシュする器
  const g = { mask: cv, adv, tinted: new Map() };
  glyphs.set(ch, g);
  return g;
}

function glyph(ch) {
  return glyphs.get(ch) ?? bakeGlyph(ch);
}

function tint(g, color) {
  const hit = g.tinted.get(color);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = CELL;
  cv.height = CELL;
  const c = cv.getContext('2d');
  c.drawImage(g.mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, CELL, CELL);

  g.tinted.set(color, cv);
  return cv;
}

/** 1文字ぶんの送り幅 */
export function charWidth(ch) {
  return glyph(ch).adv;
}

/** 文字列の描画幅 */
export function textWidth(str) {
  let w = 0;
  for (const ch of str) w += glyph(ch).adv;
  return w;
}

/**
 * 文字列を描く。x,y は左上。
 * shadow を渡すと右下1pxにその色で影を落とす（本家風の立体文字）。
 */
export function drawText(ctx, str, x, y, opt = {}) {
  const { color = '#303030', shadow = null, maxChars = Infinity } = opt;
  let px = Math.round(x);
  const py = Math.round(y);
  let n = 0;

  for (const ch of str) {
    if (n >= maxChars) break;
    n++;
    if (ch === ' ' || ch === '　') {
      px += ch === ' ' ? HALF_W : FULL_W;
      continue;
    }
    const g = glyph(ch);
    if (shadow) ctx.drawImage(tint(g, shadow), px + 1, py + 1);
    ctx.drawImage(tint(g, color), px, py);
    px += g.adv;
  }
  return px - Math.round(x);
}

/** 中央揃え */
export function drawTextCentered(ctx, str, cx, y, opt = {}) {
  return drawText(ctx, str, cx - textWidth(str) / 2, y, opt);
}

/** 右揃え */
export function drawTextRight(ctx, str, right, y, opt = {}) {
  return drawText(ctx, str, right - textWidth(str), y, opt);
}

// ---- 折り返し ----
// 日本語には単語区切りがないので幅で切る。ただし最低限の禁則処理は要る。
// 「、」が行頭に来るテキストはそれだけで素人くさく見える。

const NO_LINE_START = '、。，．」』）〕】〉》！？ー・ヽヾゝゞっゃゅょぁぃぅぇぉッャュョァィゥェォ：；';
const NO_LINE_END = '「『（〔【〈《';

/** 幅 maxW に収まるよう文字列を配列に分割する */
export function wrapText(str, maxW) {
  const lines = [];
  let line = '';
  let w = 0;

  for (const ch of str) {
    if (ch === '\n') {
      lines.push(line);
      line = '';
      w = 0;
      continue;
    }
    const cw = ch === ' ' ? HALF_W : ch === '　' ? FULL_W : glyph(ch).adv;

    if (w + cw > maxW && line) {
      // 行頭禁止文字なら、はみ出させてでもこの行に置く（ぶら下げ）
      if (NO_LINE_START.includes(ch)) {
        line += ch;
        w += cw;
        continue;
      }
      // 直前が行末禁止文字なら、それごと次の行へ送る
      let carry = '';
      if (NO_LINE_END.includes(line[line.length - 1])) {
        carry = line[line.length - 1];
        line = line.slice(0, -1);
      }
      lines.push(line);
      line = carry + ch;
      w = textWidth(line);
      continue;
    }
    line += ch;
    w += cw;
  }
  if (line) lines.push(line);
  return lines;
}

/** よく使う文字を先に焼いておく（初回表示のカクつき防止） */
export function preload(extra = '') {
  const base = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'
    + 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょー'
    + 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'
    + 'ガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョ'
    + '0123456789/:.%!?、。「」（）→←↑↓▼▲・'
    + 'ＬｖＨＰＥＸＰABZX';
  for (const ch of base + extra) glyph(ch);
}
