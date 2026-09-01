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
  /**
   * ── ここから v1.5 で足した4つ ──
   *
   * v0.12.5 は「体型・体色・大きさ・飾り」の4つだけで組んでいた。
   * 228種を並べたら **37種（17組）が完全に同じ絵**になった ――
   * リザードとブーバー、ピジョンとオニドリル、フシギダネとフシギソウ。
   * 分類が粗いのではなく、**種を分けている特徴を1つも持っていなかった。**
   *
   * 足したのは「見分けるときに人が最初に見る所」4つ。
   * どれも絵ではなく**語彙**なので、公開リポジトリに置ける（§10）。
   */
  /** 差し色。腹・模様・耳の内側に出る。空なら体色から作る。 */
  accent: string;
  /** 耳（`none` / `round` / `long` / `pointed` / `tuft` / `fin`）。 */
  ears: string;
  /** しっぽ（`none` / `thin` / `bushy` / `flame` / `bolt` / `curl` / `fan` / `spike` / `ball`）。 */
  tail: string;
  /** 模様（`none` / `belly` / `spots` / `stripes` / `band` / `mask` / `swirl` / `cheeks`）。 */
  mark: string;
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
  // ── 差し色にだけ使う色（v1.5）──
  // 体色は公式の分類10色しか無いが、**腹や模様は体色の外**にあることが多い
  cream: "#f4e8c8",
  orange: "#e8873c",
  tan: "#d8b98a",
  teal: "#4bbfae",
  navy: "#3a4f7a",
  lime: "#a8d24b",
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
  /**
   * 頭の位置と大きさ（v1.5）。耳と模様（ほお・仮面）はここに合わせる。
   *
   * 目の位置だけでは足りなかった ―― 目は**顔の中の1点**で、
   * 耳は**頭の外周**に付く。同じ数字から両方を出すと、
   * 四足の耳が背中から生えるようなことになる。
   */
  head: readonly [number, number, number];
  /** しっぽの付け根と、伸びる向き（1 = 右 / -1 = 左）。 */
  tailAt: readonly [number, number, number];
  draw: (c: string, d: string) => string;
};

const SHAPE: Record<string, Shape> = {
  // 頭だけ
  ball: { eye: [40, 50], head: [50, 56, 30], tailAt: [78, 74, 1], draw: (c, d) => `
    <circle cx="50" cy="56" r="30" fill="${c}"/>
    <path d="M20 56a30 30 0 0 0 60 0z" fill="${d}" opacity=".35"/>` },
  // 蛇型
  squiggle: { eye: [30, 26], head: [35, 28, 14], tailAt: [82, 86, 1], draw: (c, d) => `
    <path d="M80 86c-18 0-26-10-26-19s8-14 8-21-9-12-16-16" fill="none"
      stroke="${d}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M80 86c-18 0-26-10-26-19s8-14 8-21-9-12-16-16" fill="none"
      stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="35" cy="28" r="14" fill="${c}"/>` },
  // 魚型
  fish: { eye: [30, 50], head: [30, 50, 16], tailAt: [86, 56, 1], draw: (c, d) => `
    <path d="M14 56c10-18 34-24 50-16 10 5 16 12 20 16-4 4-10 11-20 16-16 8-40 2-50-16z" fill="${c}"/>
    <path d="M84 40l14-10-4 26 4 26-14-10z" fill="${d}"/>` },
  // 頭と腕
  arms: { eye: [42, 46], head: [50, 52, 26], tailAt: [76, 70, 1], draw: (c, d) => `
    <circle cx="50" cy="52" r="26" fill="${c}"/>
    <path d="M24 50c-12 2-16 12-14 22M76 50c12 2 16 12 14 22" stroke="${d}" stroke-width="9"
      stroke-linecap="round" fill="none"/>` },
  // 頭と土台
  blob: { eye: [42, 38], head: [50, 40, 24], tailAt: [80, 70, 1], draw: (c, d) => `
    <path d="M50 16c18 0 28 14 28 28 0 16 8 20 8 28H14c0-8 8-12 8-28 0-14 10-28 28-28z" fill="${c}"/>
    <ellipse cx="50" cy="72" rx="34" ry="8" fill="${d}" opacity=".4"/>` },
  // 二足＋しっぽ
  // **しっぽは体型から外した**（v1.5）。ここに描いてあると、種ごとの
  // しっぽ（炎・稲妻・房）と二重になる ―― しっぽは体型ではなく種のもの
  upright: { eye: [42, 30], head: [50, 30, 21], tailAt: [70, 64, 1], draw: (c) => `
    <path d="M50 14c14 0 22 10 22 22 0 10-6 14-6 22l6 20H28l6-20c0-8-6-12-6-22 0-12 8-22 22-22z" fill="${c}"/>` },
  // 頭と脚
  legs: { eye: [42, 40], head: [50, 44, 26], tailAt: [74, 58, 1], draw: (c, d) => `
    <circle cx="50" cy="44" r="26" fill="${c}"/>
    <path d="M38 66v20M62 66v20" stroke="${d}" stroke-width="9" stroke-linecap="round"/>` },
  // 四足
  quadruped: { eye: [20, 34], head: [24, 38, 16], tailAt: [82, 46, 1], draw: (c, d) => `
    <ellipse cx="52" cy="50" rx="32" ry="20" fill="${c}"/>
    <circle cx="24" cy="38" r="16" fill="${c}"/>
    <path d="M32 66v18M50 68v16M70 66v18" stroke="${d}" stroke-width="8" stroke-linecap="round"/>` },
  // 翼
  wings: { eye: [44, 48], head: [50, 42, 16], tailAt: [50, 78, 1], draw: (c, d) => `
    <ellipse cx="50" cy="54" rx="18" ry="24" fill="${c}"/>
    <path d="M32 46C16 34 8 40 6 52c10 4 18 10 26 12zM68 46c16-12 24-6 26 6-10 4-18 10-26 12z" fill="${d}"/>` },
  // 触手
  tentacles: { eye: [40, 42], head: [50, 44, 24], tailAt: [80, 62, 1], draw: (c, d) => `
    <path d="M20 54a30 30 0 0 1 60 0z" fill="${c}"/>
    <path d="M26 54c0 14-4 18-6 26M42 54c0 16-2 20-4 28M58 54c0 16 2 20 4 28M74 54c0 14 4 18 6 26"
      stroke="${d}" stroke-width="7" stroke-linecap="round" fill="none"/>` },
  // 複数の頭
  heads: { eye: [30, 32], head: [34, 34, 15], tailAt: [80, 76, 1], draw: (c, d) => `
    <path d="M26 84c0-16 6-24 24-24s24 8 24 24z" fill="${c}"/>
    <circle cx="34" cy="34" r="15" fill="${c}"/>
    <circle cx="66" cy="34" r="15" fill="${d}"/>` },
  // 人型
  humanoid: { eye: [44, 24], head: [50, 26, 15], tailAt: [68, 66, 1], draw: (c, d) => `
    <circle cx="50" cy="26" r="15" fill="${c}"/>
    <path d="M50 40c12 0 18 8 18 18v14H32V58c0-10 6-18 18-18z" fill="${c}"/>
    <path d="M32 46L18 60M68 46l14 14M40 72v14M60 72v14" stroke="${d}" stroke-width="8"
      stroke-linecap="round" fill="none"/>` },
  // 虫の翅
  "bug-wings": { eye: [45, 46], head: [50, 38, 14], tailAt: [50, 80, 1], draw: (c, d) => `
    <ellipse cx="50" cy="56" rx="14" ry="26" fill="${c}"/>
    <path d="M36 44c-18-12-28-4-26 12 4 10 16 12 26 6zM64 44c18-12 28-4 26 12-4 10-16 12-26 6z"
      fill="${d}" opacity=".8"/>` },
  // 甲羅
  armor: { eye: [42, 38], head: [50, 40, 22], tailAt: [80, 68, 1], draw: (c, d) => `
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

/**
 * 耳（v1.5）。**頭の外周に付ける**ので、体型が持つ `head` を受け取る。
 *
 * 中を差し色で塗るのは、耳が一番「その種らしさ」を出すところだから ――
 * ピカチュウの黒い先、キュウコンの内側、イーブイの大きい耳。
 */
type Head = readonly [number, number, number];
const EARS: Record<string, (h: Head, c: string, a: string) => string> = {
  none: () => "",
  round: ([x, y, r], c) =>
    `<circle cx="${x - r * 0.7}" cy="${y - r * 0.7}" r="${r * 0.34}" fill="${c}"/>
     <circle cx="${x + r * 0.7}" cy="${y - r * 0.7}" r="${r * 0.34}" fill="${c}"/>`,
  long: ([x, y, r], c, a) =>
    `<path d="M${x - r * 0.5} ${y - r * 0.6}l${-r * 0.3} ${-r * 1.5} ${r * 0.5} ${r * 0.4}z" fill="${c}"/>
     <path d="M${x + r * 0.5} ${y - r * 0.6}l${r * 0.3} ${-r * 1.5} ${-r * 0.5} ${r * 0.4}z" fill="${c}"/>
     <path d="M${x - r * 0.8} ${y - r * 2.1}l${-r * 0.2} ${-r * 0.35} ${r * 0.3} ${r * 0.2}z" fill="${a}"/>
     <path d="M${x + r * 0.8} ${y - r * 2.1}l${r * 0.2} ${-r * 0.35} ${-r * 0.3} ${r * 0.2}z" fill="${a}"/>`,
  pointed: ([x, y, r], c, a) =>
    `<path d="M${x - r * 0.85} ${y - r * 0.35}l${-r * 0.1} ${-r * 0.9} ${r * 0.75} ${r * 0.4}z" fill="${c}"/>
     <path d="M${x + r * 0.85} ${y - r * 0.35}l${r * 0.1} ${-r * 0.9} ${-r * 0.75} ${r * 0.4}z" fill="${c}"/>
     <path d="M${x - r * 0.7} ${y - r * 0.45}l${-r * 0.04} ${-r * 0.5} ${r * 0.42} ${r * 0.24}z" fill="${a}"/>
     <path d="M${x + r * 0.7} ${y - r * 0.45}l${r * 0.04} ${-r * 0.5} ${-r * 0.42} ${r * 0.24}z" fill="${a}"/>`,
  tuft: ([x, y, r], c) =>
    `<path d="M${x - r * 0.4} ${y - r}l${-r * 0.16} ${-r * 0.6} ${r * 0.4} ${r * 0.34}z
      M${x} ${y - r * 1.1}l0 ${-r * 0.7} ${r * 0.3} ${r * 0.5}z
      M${x + r * 0.4} ${y - r}l${r * 0.16} ${-r * 0.6} ${-r * 0.4} ${r * 0.34}z" fill="${c}"/>`,
  fin: ([x, y, r], c, a) =>
    `<path d="M${x - r * 0.9} ${y - r * 0.2}l${-r * 0.7} ${-r * 0.3} ${r * 0.6} ${r * 0.6}z" fill="${a}"/>
     <path d="M${x + r * 0.9} ${y - r * 0.2}l${r * 0.7} ${-r * 0.3} ${-r * 0.6} ${r * 0.6}z" fill="${c}"/>`,
};

/** しっぽ。付け根と向きは体型が持つ（`tailAt`）。 */
type At = readonly [number, number, number];
const TAIL: Record<string, (t: At, c: string, a: string) => string> = {
  none: () => "",
  thin: ([x, y, k], c) =>
    `<path d="M${x} ${y}c${14 * k} 2 ${20 * k} 10 ${20 * k} 22" stroke="${c}" stroke-width="7"
      stroke-linecap="round" fill="none"/>`,
  bushy: ([x, y, k], c, a) =>
    `<path d="M${x} ${y}c${16 * k} -2 ${24 * k} 6 ${22 * k} 20" stroke="${c}" stroke-width="15"
      stroke-linecap="round" fill="none"/>
     <circle cx="${x + 22 * k}" cy="${y + 20}" r="8" fill="${a}"/>`,
  flame: ([x, y, k], c) =>
    `<path d="M${x} ${y}c${12 * k} 2 ${18 * k} 8 ${18 * k} 18" stroke="${c}" stroke-width="7"
      stroke-linecap="round" fill="none"/>
     <path d="M${x + 18 * k} ${y + 20}c${5 * k} -6 ${3 * k} -13 ${-1 * k} -17
      ${8 * k} 2 ${12 * k} 10 ${9 * k} 17-${2 * k} 6-${8 * k} 9-${13 * k} 7
      ${4 * k} -2 ${6 * k} -4 ${5 * k} -7z" fill="#f08a3c"/>`,
  bolt: ([x, y, k], c) =>
    `<path d="M${x} ${y}l${10 * k} -4 ${-4 * k} 10 ${12 * k} -2 ${-6 * k} 12 ${12 * k} -3
      ${-8 * k} 20 ${-4 * k} -12 ${-8 * k} 4 ${5 * k} -12 ${-11 * k} 3z" fill="${c}"/>`,
  curl: ([x, y, k], c) =>
    `<path d="M${x} ${y}c${12 * k} 0 ${16 * k} 8 ${10 * k} 13s${-14 * k} 1-${10 * k} -5"
      stroke="${c}" stroke-width="6" stroke-linecap="round" fill="none"/>`,
  fan: ([x, y, k], c, a) =>
    `<path d="M${x} ${y}l${18 * k} 6 ${-2 * k} 8 ${-16 * k} -2z" fill="${c}"/>
     <path d="M${x} ${y + 4}l${16 * k} 10 ${-4 * k} 7 ${-12 * k} -8z" fill="${a}"/>`,
  spike: ([x, y, k], c) =>
    `<path d="M${x} ${y}c${12 * k} 2 ${18 * k} 8 ${18 * k} 18" stroke="${c}" stroke-width="8"
      stroke-linecap="round" fill="none"/>
     <path d="M${x + 8 * k} ${y - 1}l${3 * k} -8 ${4 * k} 8z
      M${x + 16 * k} ${y + 8}l${5 * k} -6 ${1 * k} 9z" fill="${c}"/>`,
  // 尾びれ（アシカ・シャワーズ）。**縦ではなく横に開く** ―― 縦だと魚に見える
  fin: ([x, y, k], c, a) =>
    `<path d="M${x} ${y}c${10 * k} 2 ${14 * k} 6 ${14 * k} 12" stroke="${c}" stroke-width="9"
      stroke-linecap="round" fill="none"/>
     <path d="M${x + 14 * k} ${y + 12}l${10 * k} -6 ${-2 * k} 9 ${8 * k} 5-${18 * k} 1z" fill="${a}"/>`,
  ball: ([x, y, k], c, a) =>
    `<path d="M${x} ${y}c${12 * k} 2 ${16 * k} 8 ${16 * k} 16" stroke="${c}" stroke-width="6"
      stroke-linecap="round" fill="none"/>
     <circle cx="${x + 16 * k}" cy="${y + 18}" r="7" fill="${a}"/>`,
};

/** 模様。**体の上に重ねる** ―― 体色を変えずに済むので、体型を選ばない。 */
const MARK: Record<string, (h: Head, c: string, a: string) => string> = {
  none: () => "",
  belly: ([x, y, r], _c, a) =>
    `<ellipse cx="${x}" cy="${y + r * 1.4}" rx="${r * 0.8}" ry="${r * 0.95}" fill="${a}" opacity=".9"/>`,
  spots: ([x, y, r], _c, a) =>
    `<circle cx="${x + r * 1.3}" cy="${y + r * 0.2}" r="${r * 0.26}" fill="${a}"/>
     <circle cx="${x + r * 2.1}" cy="${y + r * 0.8}" r="${r * 0.2}" fill="${a}"/>
     <circle cx="${x + r * 1.6}" cy="${y + r * 1.1}" r="${r * 0.16}" fill="${a}"/>`,
  stripes: ([x, y, r], _c, a) =>
    `<path d="M${x + r * 0.9} ${y - r * 0.2}h${r * 0.9}v${r * 0.34}h${-r * 0.9}z
      M${x + r * 1.1} ${y + r * 0.7}h${r * 0.9}v${r * 0.34}h${-r * 0.9}z" fill="${a}" opacity=".85"/>`,
  band: ([x, y, r], _c, a) =>
    `<path d="M${x - r * 0.9} ${y + r * 1.1}h${r * 1.8}v${r * 0.4}h${-r * 1.8}z" fill="${a}" opacity=".9"/>`,
  mask: ([x, y, r], _c, a) =>
    `<path d="M${x - r * 0.95} ${y - r * 0.35}h${r * 1.9}v${r * 0.5}h${-r * 1.9}z" fill="${a}" opacity=".85"/>`,
  swirl: ([x, y, r], _c, a) =>
    `<path d="M${x + r * 0.2} ${y + r * 0.9}a${r * 0.5} ${r * 0.5} 0 1 1 ${r * 0.5} ${-r * 0.45}
      a${r * 0.28} ${r * 0.28} 0 1 0 ${-r * 0.28} ${r * 0.25}" fill="none" stroke="${a}"
      stroke-width="${r * 0.16}" stroke-linecap="round"/>`,
  cheeks: ([x, y, r], _c, a) =>
    `<circle cx="${x - r * 0.78}" cy="${y + r * 0.3}" r="${r * 0.24}" fill="${a}"/>
     <circle cx="${x + r * 0.78}" cy="${y + r * 0.3}" r="${r * 0.24}" fill="${a}"/>`,
};

export const EAR_NAMES = Object.keys(EARS);
export const TAIL_NAMES = Object.keys(TAIL);
export const MARK_NAMES = Object.keys(MARK);
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
  // 差し色。**指定が無ければ体色を明るくしたもの** ―― 白い腹のつもりで
  // いつも白にすると、白い種の腹だけが消える
  const accent = BODY[recipe.accent] ?? shade(body, 0.26);
  const draw = SHAPE[recipe.shape] ?? SHAPE["blob"]!;
  const parts = recipe.parts.map((p) => PART[p]?.(body) ?? "").join("");
  const flip = facing === "right" ? "scale(-1,1) translate(-100,0) " : "";
  // **大きさは足元を軸に拡げる。** 中心で拡げると、大きい種が宙に浮いて見える
  const k = SCALE[recipe.size] ?? 1;
  const scale = `translate(${50 - 50 * k},${92 - 92 * k}) scale(${k})`;
  /*
   * **重ねる順に意味がある**（v1.5）。
   *   しっぽ → 体 → 模様 → 耳 → 飾り → 目
   * しっぽを体より先に描くのは、付け根が体の下に隠れて生えて見えるため。
   * 模様は体の上、耳はその上（耳に模様が乗ると汚れに見える）。
   */
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <g transform="${flip}${scale}">
      <ellipse cx="50" cy="92" rx="28" ry="5" fill="rgba(0,0,0,.18)"/>
      ${TAIL[recipe.tail]?.(draw.tailAt, dark, accent) ?? ""}
      ${draw.draw(body, dark)}
      ${MARK[recipe.mark]?.(draw.head, body, accent) ?? ""}
      ${EARS[recipe.ears]?.(draw.head, body, accent) ?? ""}
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
