/**
 * 建物のまとまり描画（v0.10.5）。
 *
 * 家もポケモンセンターもショップも、データの上では**同じ文字が並んだ矩形**でしかない。
 * v0.10 まではその1マスずつを塗っていたので、**壁の色をした四角の集まり**に見えていた。
 *
 * ここでは「同じ文字が繋がっている塊」を先に見つけ、
 * **塊ぜんたいに対して**屋根・壁・窓を描く。塊の大きさを知って初めて
 * 「屋根は上2列、窓は壁の真ん中」のような描き方ができる。
 *
 * **データは1文字も変えていない。** 見つけ方が変わっただけ。
 */

import type { MapData } from "@pkmn/core";
import { shade, TILE_HINT } from "./tiles.js";

/** 建物として扱う凡例の文字。ここに無い文字はただの地形。 */
const BUILDING = new Set(["H", "P", "F", "A"]);

export type Building = {
  hint: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * マップから建物の塊を拾う。
 *
 * 同じ文字が縦横に繋がっている範囲を1つの建物として扱う（4近傍の塗りつぶし）。
 * **マップごとに1回だけ計算して覚える** ―― 毎フレームやる意味は無い。
 */
const cache = new Map<string, Building[]>();

export function buildingsOf(map: MapData): Building[] {
  const cached = cache.get(map.id);
  if (cached !== undefined) return cached;

  const { width, height } = map.size;
  const seen = new Uint8Array(width * height);
  const found: Building[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const hint = map.layers.ground[i];
      if (seen[i] === 1 || hint === undefined || !BUILDING.has(hint)) continue;

      // 4近傍の塗りつぶしで、同じ文字の繋がりを1つ拾う
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [i];
      seen[i] = 1;
      while (stack.length > 0) {
        const at = stack.pop()!;
        const ax = at % width;
        const ay = (at - ax) / width;
        minX = Math.min(minX, ax);
        maxX = Math.max(maxX, ax);
        minY = Math.min(minY, ay);
        maxY = Math.max(maxY, ay);
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const nx = ax + dx;
          const ny = ay + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (seen[ni] === 1 || map.layers.ground[ni] !== hint) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      found.push({ hint, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }

  cache.set(map.id, found);
  return found;
}

/**
 * 建物を1棟描く。
 *
 * 上の2列（塊が低ければ1列）を屋根、残りを壁にする。
 * **屋根の色は凡例の文字が決める** ―― ポケモンセンターは赤、ショップは青、
 * 大会会場は紫。原作の見分け方をそのまま使う。
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  building: Building,
  screenX: number,
  screenY: number,
  size: number,
): void {
  const roofColor = TILE_HINT[building.hint] ?? "#b5674c";
  const wallColor = "#e8dcc4";
  const w = building.w * size;
  const h = building.h * size;
  const roofRows = building.h >= 3 ? 2 : 1;
  const roofH = roofRows * size;

  // ── 壁 ──
  ctx.fillStyle = wallColor;
  ctx.fillRect(screenX, screenY + roofH, w, h - roofH);
  ctx.fillStyle = shade(wallColor, -0.1);
  ctx.fillRect(screenX, screenY + h - 3, w, 3);

  // ── 窓 ──
  // 壁が1列ぶんも無いときは描かない（潰れて汚くなるだけ）
  if (h - roofH >= size * 0.8) {
    ctx.fillStyle = "#6f8fb5";
    const windowW = Math.round(size * 0.42);
    const windowH = Math.round(size * 0.34);
    const gap = (w - windowW * 2) / 3;
    const wy = screenY + roofH + Math.round(size * 0.28);
    for (let n = 0; n < 2; n += 1) {
      const wx = screenX + gap + n * (windowW + gap);
      ctx.fillRect(wx, wy, windowW, windowH);
      ctx.fillStyle = shade("#6f8fb5", 0.2);
      ctx.fillRect(wx, wy, windowW, 2);
      ctx.fillStyle = "#6f8fb5";
    }
  }

  // ── 屋根 ──
  // 少しはみ出させる。**軒が出ていると「乗っている」ように見える**
  const eave = Math.round(size * 0.12);
  ctx.fillStyle = roofColor;
  ctx.fillRect(screenX - eave, screenY, w + eave * 2, roofH);
  ctx.fillStyle = shade(roofColor, 0.13);
  ctx.fillRect(screenX - eave, screenY, w + eave * 2, Math.max(3, Math.round(size / 6)));
  ctx.fillStyle = shade(roofColor, -0.18);
  ctx.fillRect(screenX - eave, screenY + roofH - 3, w + eave * 2, 3);
}

/** マップを差し替えたときに捨てる（開発時の再読み込み用）。 */
export function forgetBuildings(): void {
  cache.clear();
}
