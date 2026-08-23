/**
 * ポケモンの姿（v0.12.5）。
 *
 * **丸をやめて、種ごとにシルエットを描き分ける。**
 * 151種＋追加分を1体ずつ描くのは終わりが無いので、
 * v0.10.5 のタイルと同じ形にする ―― **種類だけがコードで、種ごとの指定はデータ。**
 *
 *   体型（`shape`）… 公式の分類14種。ここに描き方がある
 *   体色（`color`）… 公式の分類10色
 *   飾り（`parts`）… タイプから足した装飾。炎・葉・ひれ・角 など
 *
 * レシピは `packages/data/art.json`（原本は `source/art.tsv`）。
 * **絵ではなく分類**なので、公開リポジトリに置ける（game-plan.md §10）。
 *
 * 手元に公式素材があるときは、そちらを優先する（`art/source.ts` と同じ約束）。
 */

import { imageSrc } from "./source.js";

export type ArtRecipe = {
  species: string;
  shape: string;
  color: string;
  size: string;
  parts: readonly string[];
};

/** 公式の高さから丸めた4段階。**同じ体型でも進化前後で大きさが変わる。** */
const SCALE: Record<string, number> = { tiny: 0.62, small: 0.78, medium: 0.92, large: 1.06 };

/** 公式の体色。**タイプ色ではなく体色**を使う ―― 見分けの手がかりは体の色のほう。 */
const BODY: Record<string, string> = {
  black: "#4c4f57",
  blue: "#4a7fd0",
  brown: "#9c6b43",
  gray: "#9aa0a6",
  green: "#57ab57",
  pink: "#e88fb4",
  purple: "#9b6bc4",
  red: "#d05252",
  white: "#dfe3e8",
  yellow: "#e8c445",
};

const shade = (hex: string, amount: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/**
 * 体型ごとの本体。**0〜100 の箱の中**に収める。
 *
 * レジストリの形はこれで7回目（技効果・持ち物・イベント・検証・タイル…）。
 * 体型を1つ足すのはここに1行足すことで、データ側は触らない。
 */
type Shape = {
  /** 目を置く位置。**体型ごとに頭のある場所が違う**ので、固定にすると体に目がつく。 */
  eye: readonly [number, number];
  draw: (c: string, d: string) => string;
};

const SHAPE: Record<string, Shape> = {
  // 頭だけ
  ball: { eye: [40, 50], draw: (c, d) => `
    <circle cx="50" cy="56" r="30" fill="${c}"/>
    <path d="M20 56a30 30 0 0 0 60 0z" fill="${d}" opacity=".35"/>` },
  // 蛇型
  squiggle: { eye: [30, 26], draw: (c, d) => `
    <path d="M80 86c-18 0-26-10-26-19s8-14 8-21-9-12-16-16" fill="none"
      stroke="${d}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M80 86c-18 0-26-10-26-19s8-14 8-21-9-12-16-16" fill="none"
      stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="35" cy="28" r="14" fill="${c}"/>` },
  // 魚型
  fish: { eye: [30, 50], draw: (c, d) => `
    <path d="M14 56c10-18 34-24 50-16 10 5 16 12 20 16-4 4-10 11-20 16-16 8-40 2-50-16z" fill="${c}"/>
    <path d="M84 40l14-10-4 26 4 26-14-10z" fill="${d}"/>` },
  // 頭と腕
  arms: { eye: [42, 46], draw: (c, d) => `
    <circle cx="50" cy="52" r="26" fill="${c}"/>
    <path d="M24 50c-12 2-16 12-14 22M76 50c12 2 16 12 14 22" stroke="${d}" stroke-width="9"
      stroke-linecap="round" fill="none"/>` },
  // 頭と土台
  blob: { eye: [42, 38], draw: (c, d) => `
    <path d="M50 16c18 0 28 14 28 28 0 16 8 20 8 28H14c0-8 8-12 8-28 0-14 10-28 28-28z" fill="${c}"/>
    <ellipse cx="50" cy="72" rx="34" ry="8" fill="${d}" opacity=".4"/>` },
  // 二足＋しっぽ
  upright: { eye: [42, 30], draw: (c, d) => `
    <path d="M50 14c14 0 22 10 22 22 0 10-6 14-6 22l6 20H28l6-20c0-8-6-12-6-22 0-12 8-22 22-22z" fill="${c}"/>
    <path d="M70 62c14 2 20 10 20 22" stroke="${d}" stroke-width="8" stroke-linecap="round" fill="none"/>` },
  // 頭と脚
  legs: { eye: [42, 40], draw: (c, d) => `
    <circle cx="50" cy="44" r="26" fill="${c}"/>
    <path d="M38 66v20M62 66v20" stroke="${d}" stroke-width="9" stroke-linecap="round"/>` },
  // 四足
  quadruped: { eye: [20, 34], draw: (c, d) => `
    <ellipse cx="52" cy="50" rx="32" ry="20" fill="${c}"/>
    <circle cx="24" cy="38" r="16" fill="${c}"/>
    <path d="M32 66v18M50 68v16M70 66v18" stroke="${d}" stroke-width="8" stroke-linecap="round"/>` },
  // 翼
  wings: { eye: [44, 48], draw: (c, d) => `
    <ellipse cx="50" cy="54" rx="18" ry="24" fill="${c}"/>
    <path d="M32 46C16 34 8 40 6 52c10 4 18 10 26 12zM68 46c16-12 24-6 26 6-10 4-18 10-26 12z" fill="${d}"/>` },
  // 触手
  tentacles: { eye: [40, 42], draw: (c, d) => `
    <path d="M20 54a30 30 0 0 1 60 0z" fill="${c}"/>
    <path d="M26 54c0 14-4 18-6 26M42 54c0 16-2 20-4 28M58 54c0 16 2 20 4 28M74 54c0 14 4 18 6 26"
      stroke="${d}" stroke-width="7" stroke-linecap="round" fill="none"/>` },
  // 複数の頭
  heads: { eye: [30, 32], draw: (c, d) => `
    <path d="M26 84c0-16 6-24 24-24s24 8 24 24z" fill="${c}"/>
    <circle cx="34" cy="34" r="15" fill="${c}"/>
    <circle cx="66" cy="34" r="15" fill="${d}"/>` },
  // 人型
  humanoid: { eye: [44, 24], draw: (c, d) => `
    <circle cx="50" cy="26" r="15" fill="${c}"/>
    <path d="M50 40c12 0 18 8 18 18v14H32V58c0-10 6-18 18-18z" fill="${c}"/>
    <path d="M32 46L18 60M68 46l14 14M40 72v14M60 72v14" stroke="${d}" stroke-width="8"
      stroke-linecap="round" fill="none"/>` },
  // 虫の翅
  "bug-wings": { eye: [45, 46], draw: (c, d) => `
    <ellipse cx="50" cy="56" rx="14" ry="26" fill="${c}"/>
    <path d="M36 44c-18-12-28-4-26 12 4 10 16 12 26 6zM64 44c18-12 28-4 26 12-4 10-16 12-26 6z"
      fill="${d}" opacity=".8"/>` },
  // 甲羅
  armor: { eye: [42, 38], draw: (c, d) => `
    <path d="M50 18c20 0 32 14 32 30S70 80 50 80 18 64 18 48 30 18 50 18z" fill="${c}"/>
    <path d="M50 18v62M20 44h60" stroke="${d}" stroke-width="6"/>` },
};

/** 飾り。本体の上に重ねる。 */
const PART: Record<string, (c: string) => string> = {
  flame: () => `<path d="M84 68c6-6 4-14 0-18 8 2 12 10 10 18-2 6-8 10-14 8 4-2 6-5 4-8z" fill="#f08a3c"/>`,
  plant: () => `<path d="M50 12c-12-4-20 2-22 10 10 4 18 0 22-10z" fill="#4f9b46"/>`,
  fin: () => `<path d="M50 8l10 14H40z" fill="#5aa8d8"/>`,
  spark: () => `<path d="M76 14l-12 16h8l-8 14 18-18h-8z" fill="#f2d24b"/>`,
  crystal: () => `<path d="M26 16l8 12-8 10-8-10z" fill="#9fd8e8"/>`,
  drip: () => `<circle cx="24" cy="80" r="5" fill="#9b6bc4"/>`,
  aura: (c) => `<circle cx="50" cy="50" r="42" fill="none" stroke="${c}" stroke-width="3" opacity=".35"/>`,
  horn: () => `<path d="M60 10l6 16-14-4z" fill="#e6e1d4"/>`,
  spike: () => `<path d="M34 12l6 14h-12zM66 12l6 14h-12z" fill="#c9ccd1"/>`,
  plate: () => `<path d="M30 52h40v8H30z" fill="#b7bec7" opacity=".8"/>`,
  antenna: () => `<path d="M42 20l-8-14M58 20l8-14" stroke="#6b5a3a" stroke-width="4" stroke-linecap="round"/>`,
  wing: () => `<path d="M14 40c-8 4-8 14 0 20 6-4 10-10 12-16z" fill="#f0f2f5" opacity=".9"/>`,
  band: () => `<path d="M28 62h44v7H28z" fill="#d05252" opacity=".85"/>`,
  sparkle: () => `<path d="M82 22l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffe9a8"/>`,
};

export const SHAPE_NAMES = Object.keys(SHAPE);
export const PART_NAMES = Object.keys(PART);

/**
 * 姿を SVG にする。
 *
 * **`facing` で左右を返す。** 味方は背中側（右向き）、相手は正面（左向き）。
 * 反転は `transform` 1つで済むので、体型ごとに2枚描く必要はない。
 */
export function speciesSvg(recipe: ArtRecipe, facing: "left" | "right" = "left"): string {
  const body = BODY[recipe.color] ?? BODY["gray"]!;
  const dark = shade(body, -0.16);
  const draw = SHAPE[recipe.shape] ?? SHAPE["blob"]!;
  const parts = recipe.parts.map((p) => PART[p]?.(body) ?? "").join("");
  const flip = facing === "right" ? "scale(-1,1) translate(-100,0) " : "";
  // **大きさは足元を軸に拡げる。** 中心で拡げると、大きい種が宙に浮いて見える
  const k = SCALE[recipe.size] ?? 1;
  const scale = `translate(${50 - 50 * k},${92 - 92 * k}) scale(${k})`;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <g transform="${flip}${scale}">
      <ellipse cx="50" cy="92" rx="28" ry="5" fill="rgba(0,0,0,.18)"/>
      ${draw.draw(body, dark)}
      ${parts}
      <circle cx="${draw.eye[0]}" cy="${draw.eye[1]}" r="4" fill="#1b1d21"/>
      <circle cx="${draw.eye[0] + 1.5}" cy="${draw.eye[1] - 1.5}" r="1.4" fill="#fff"/>
    </g>
  </svg>`;
}

/**
 * 姿の中身（`<img>` か SVG）。
 *
 * **手元に公式素材があればそちらを使う。** 無ければ描く ――
 * タイルと同じで、素材が無いのは逃げ道ではなく通常動作。
 */
export function speciesFigure(recipe: ArtRecipe, facing: "left" | "right" = "left"): string {
  const src = imageSrc(`species-${recipe.species}`);
  if (src !== null) {
    return `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain"${
      facing === "right" ? ' class="flip"' : ""
    } />`;
  }
  return speciesSvg(recipe, facing);
}
