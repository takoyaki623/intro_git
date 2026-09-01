/**
 * 地形の描き分け（v0.10.5）。
 *
 * v0.10 まで、1マスは**1色の四角**だった。地形と通行可否から色を決め、
 * 通れないマスには枠線を引く ―― 規則としては正しいが、
 * **町も森も同じ大きさの四角が並ぶだけ**で、地面と物の区別がつかなかった。
 *
 * ここでやるのは1つだけ。
 *
 * > **隣を見る。**
 *
 * 同じ地形が隣にあるかどうかで、角・辺・内側を描き分ける（オートタイル）。
 * **データは1文字も変えていない** ―― `layers.ground` の凡例文字は v0.7 からあり、
 * それを「隣と同じか」に使うだけで、草地に縁ができ、木がまとまり、道が繋がる。
 *
 * 設計: docs/design/ui-flow.md §2.3・§2.4
 */

import type { TerrainId } from "@pkmn/core";
import { drawImage } from "./source.js";

/**
 * 凡例の文字ごとの色。**見た目のヒントにしか使わない。**
 *
 * 通行可否と地形は `collision` / `terrain` が持っていて、ここは一切関与しない。
 * 逆に、規則からだけ色を決めると「木の茂み」と「家の壁」が同じ緑になり、
 * 町が森に見えてしまう（v0.7 で一度そうなった）。
 */
export const TILE_HINT: Record<string, string> = {
  T: "#3c6b34", // 木
  H: "#b5674c", // 家の壁
  W: "#9a9086", // 屋内の壁
  B: "#7a6ba8", // ベッド
  C: "#5d6a7a", // パソコン
  M: "#5a6f7d", // 機械・棚
  P: "#c94f46", // ポケモンセンターの屋根（原作の赤）
  F: "#3f6fa8", // フレンドリィショップの屋根（原作の青）
  A: "#8a6fb0", // 大会会場の屋根（拠点）
  S: "#a98b5f", // カウンター
  X: "#8b8f98", // 石の壁（拠点）
  G: "#d8cba0", // ゲート前の敷石（拠点）
  D: "#8a5f33", // ドア
  I: "#cbbf9c", // 見えない壁（床と同じ色。v1.1-g）
  t: "#9a6b42", // 机・テーブル（v1.4-b）
};

/**
 * **見た目だけ別の文字として扱う**（v1.1-g）。
 *
 * 凡例は「見た目（文字）」と「規則（地形＋`!`）」が別物なので、
 * *通行不可のまま床として描く*ことができる ―― セキチクジムの見えない壁。
 *
 * `TILE_HINT` に色を足すだけでは足りなかった。オートタイルの縁は
 * **隣が同じ文字か**で決まるので、色だけ合わせても
 * 見えない壁の周りに縁が出て、**床の上に格子が浮かんで見える。**
 * 計画では「`TILE_HINT` に1行」と見積もっていたが、
 * 隣接の判定がもう1箇所あることを数え落としていた。
 */
export const TILE_ALIAS: Record<string, string> = {
  I: ".",
};

/** 地面の基本色。地形が優先で、無ければ凡例の文字、それも無ければ規則。 */
export function baseColor(terrain: TerrainId, blocked: boolean, hint: string | undefined): string {
  if (terrain === "water") return "#2f6fb5";
  if (terrain === "grass") return "#4f9b46";
  if (terrain === "ledge") return "#8a6a3d";
  if (terrain === "sand") return "#d8c48a";
  // 氷（v1.1-k）。**床として描くが、乗ると止まれない** ―― 見た目でそれと分かる色にする
  if (terrain === "ice") return "#bfe6f2";
  // 滝は水より明るく、白を混ぜる ―― 水面と地続きに見えると登り口が分からない
  if (terrain === "waterfall") return "#6fa8dc";
  if (terrain === "cave") return blocked ? "#4a4642" : "#7b736b";
  const named = hint === undefined ? undefined : TILE_HINT[hint];
  if (named !== undefined) return named;
  return blocked ? "#3d5a3a" : "#cbbf9c";
}

/** 明るさを足し引きした色。オートタイルの縁と面に使う。 */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount * 255)));
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `rgb(${r},${g},${b})`;
}

/** 隣接の様子。呼び出し側がマップを見て埋める。 */
export type Neighbors = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type TileView = {
  terrain: TerrainId;
  blocked: boolean;
  /** 凡例の文字（`layers.ground`）。 */
  hint: string | undefined;
  /** **同じ種類**が隣にあるか。種類の判定は呼び出し側（同じ文字 or 同じ地形）。 */
  same: Neighbors;
  /**
   * 地図の上の位置。**模様を置く場所を決めるのに使う**（v1.3-f）。
   *
   * 画面の座標では駄目だった ―― `camera()` は行数が偶数だと半マスずれるので、
   * 歩くたびに模様の位置が変わり、**地面が這って見える。**
   * 模様は地面に属するものなので、地面の座標から決める。
   */
  cell: { x: number; y: number };
};

/**
 * 角を丸く見せる大きさ。**1マスに対する割合で持つ**（v1.3-f）。
 *
 * ここは長らく固定の 5px だった。1マスが 28px の頃は 18% で収まっていたが、
 * **v1.3-a で 16px にしたとき 31% になり**、角が面を食い始めていた
 * ―― 大きさを変えたら、大きさに紐づく数字も一緒に動かす。
 */
const cornerOf = (size: number): number => Math.max(2, Math.round(size / 6));

/**
 * 1マス描く。
 *
 * 順に「面 → 縁 → 地形ごとの模様」。
 * 縁を**内側に**描くので、隣り合う同種のマスの間には線が出ない ――
 * これが「1色の四角が並ぶ」感じを消す一番効く部分。
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  view: TileView,
  x: number,
  y: number,
  size: number,
): void {
  // 凡例の文字で1枚ずつ差してもよいし、地形名でまとめて1枚でもよい（source.ts）
  const names = view.hint === undefined
    ? [`tile-${view.terrain}`]
    : [`tile-${view.hint}`, `tile-${view.terrain}`];
  if (drawImage(ctx, names, x, y, size)) return;

  const base = baseColor(view.terrain, view.blocked, view.hint);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, size, size);

  // ── 縁 ──
  // 隣が違う種類の側だけ、内側に細い帯を引く。
  // 上辺は明るく、下辺は暗く ―― 光が上から来ているという1つの約束だけで、
  // 平らな四角が「面」に見えるようになる
  const edge = Math.max(2, Math.round(size / 9));
  const { same } = view;
  if (!same.up) {
    ctx.fillStyle = shade(base, 0.1);
    ctx.fillRect(x, y, size, edge);
  }
  if (!same.down) {
    ctx.fillStyle = shade(base, -0.12);
    ctx.fillRect(x, y + size - edge, size, edge);
  }
  if (!same.left) {
    ctx.fillStyle = shade(base, 0.05);
    ctx.fillRect(x, y, edge, size);
  }
  if (!same.right) {
    ctx.fillStyle = shade(base, -0.06);
    ctx.fillRect(x + size - edge, y, edge, size);
  }

  // ── 角 ──
  // 2辺が同時に外を向いているところだけ、少し丸く見せる
  ctx.fillStyle = shade(base, -0.18);
  const corner = cornerOf(size);
  const corners = [
    [!same.up && !same.left, x, y],
    [!same.up && !same.right, x + size - corner, y],
    [!same.down && !same.left, x, y + size - corner],
    [!same.down && !same.right, x + size - corner, y + size - corner],
  ] as const;
  for (const [on, cx, cy] of corners) {
    if (on) ctx.fillRect(cx, cy, corner, corner);
  }

  drawPattern(ctx, view, x, y, size);
}

/** 地形ごとの模様。草の葉・段差の落ち際・水面。 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  view: TileView,
  x: number,
  y: number,
  size: number,
): void {
  const base = baseColor(view.terrain, view.blocked, view.hint);

  if (view.terrain === "grass") {
    // 草むらは「入ると野生が出る」印でもあるので、必ず見分けがつくようにする。
    //
    // **原作の草は小さな株が2つ**（v1.3-f）。
    // 1マスいっぱいの縦棒3本に濃い根元を敷いたら、並べたときに
    // **横縞と縦の筋が立って畑に見えた** ―― 一度描いて、見て、やめた形。
    // 高さと位置をずらした株を2つにすると、隣のマスと筋が揃わない。
    const w = Math.max(1, Math.round(size / 12));
    const tufts = [
      { cx: 0.14, cy: 0.3 },
      { cx: 0.54, cy: 0.46 },
    ] as const;
    ctx.fillStyle = shade(base, -0.3);
    for (const { cx, cy } of tufts) {
      const bx = x + size * cx;
      const by = y + size * cy;
      const h = size * 0.3;
      ctx.fillRect(bx, by + h * 0.4, w, h * 0.6); // 左の葉
      ctx.fillRect(bx + size * 0.11, by, w, h); // 真ん中の葉（一番高い）
      ctx.fillRect(bx + size * 0.22, by + h * 0.4, w, h * 0.6); // 右の葉
    }
    // 株の足元だけ影を置く。**マス全体には敷かない** ―― 敷くと横縞になる
    ctx.fillStyle = shade(base, -0.16);
    for (const { cx, cy } of tufts) {
      ctx.fillRect(
        x + size * cx,
        y + size * cy + size * 0.3,
        size * 0.22 + w,
        Math.max(1, Math.round(size / 16)),
      );
    }
    return;
  }

  if (view.terrain === "ledge") {
    // 段差は南にしか降りられない。**落ち際を下辺に描く**ことで向きを示す
    ctx.fillStyle = shade(base, -0.3);
    ctx.fillRect(x, y + size - Math.round(size / 4), size, Math.round(size / 4));
    ctx.fillStyle = shade(base, 0.12);
    ctx.fillRect(x, y + size - Math.round(size / 4), size, 2);
    return;
  }

  if (view.terrain === "water") {
    ctx.fillStyle = shade(base, 0.14);
    ctx.fillRect(x + size * 0.15, y + size * 0.35, size * 0.3, 2);
    ctx.fillRect(x + size * 0.55, y + size * 0.62, size * 0.28, 2);
    return;
  }

  /*
   * 木（v1.3-f）。1マス1色だと「緑の四角」でしかない。
   *
   * **林に見えるのは、木そのものより木と木の間の隙間。**
   * 隣がどうであれ四隅にごく薄い影を置くと、面が丸に割れて
   * 1本ずつの樹冠が並んでいるように見える ――
   * 林の**外周**の丸みは `drawTile` の角がすでに持っているので、ここでは足さない。
   *
   * 一度、ここで四隅を「地面色で削る」つもりで `shade(base, -0.42)` を塗った。
   * 木の緑は元が暗いので**黒に振り切れ**、林が「黒い穴の並んだ格子」になった
   * ―― 数字だけ見ても分からず、撮って見て初めて分かる類の失敗。
   */
  if (view.hint === "T") {
    const gap = Math.max(1, Math.round(size / 6));
    ctx.fillStyle = shade(base, -0.12);
    for (const [gx, gy] of [
      [x, y],
      [x + size - gap, y],
      [x, y + size - gap],
      [x + size - gap, y + size - gap],
    ] as const) {
      ctx.fillRect(gx, gy, gap, gap);
    }
    // 幹
    const tw = Math.max(2, Math.round(size / 7));
    ctx.fillStyle = shade(base, -0.16);
    ctx.fillRect(x + (size - tw) / 2, y + size * 0.7, tw, size * 0.3);
    // 葉の明るい所。**真ん中に置かない** ―― 幹と縦に並ぶと「T」の字に見える
    ctx.fillStyle = shade(base, 0.14);
    ctx.fillRect(
      x + size * 0.24,
      y + size * 0.24,
      Math.max(2, Math.round(size / 5)),
      Math.max(2, Math.round(size / 7)),
    );
    ctx.fillStyle = shade(base, -0.09);
    ctx.fillRect(x + size * 0.5, y + size * 0.46, size * 0.3, Math.max(1, Math.round(size / 8)));
    return;
  }

  /*
   * ── 屋内のもの（v1.4-b）──
   *
   * 屋外は v0.10.5 のオートタイルと v1.3-f の模様で形が出るようになったが、
   * **屋内はずっと1マス1色のままだった** ―― ベッドが紫の帯、テレビが青い帯、
   * カウンターが茶色の帯で、部屋が「板の並び」に見えていた。
   *
   * ここでも足すのは1つだけ。
   *
   * > **上と下を見る。**
   *
   * 家具は上から見た箱なので、**上の縁が天面、下の縁が前面**になる。
   * どちらが縁かは `view.same` がすでに知っている（オートタイルと同じ材料）
   * ―― だから塊の大きさを測り直す必要が無い。1マスずつ描いても
   * 「カウンターの手前側」「ベッドの枕側」が揃う。
   */
  const { same } = view;
  /** 天面（上が外を向いている側）と前面（下が外を向いている側）の帯の高さ。 */
  const face = Math.max(2, Math.round(size / 3));

  if (view.hint === "W" || view.hint === "X") {
    // 屋内の壁。**下端だけ幅木**を入れると、床と壁の境が読める。
    // 石壁（X）は目地を入れて、同じ形にしない
    if (view.hint === "X") {
      ctx.fillStyle = shade(base, -0.12);
      const course = Math.max(1, Math.round(size / 8));
      ctx.fillRect(x, y + size / 2 - course / 2, size, 1);
      // 段ごとに継ぎ目をずらす（レンガ）
      const shift = view.cell.y % 2 === 0 ? 0 : size / 2;
      ctx.fillRect(x + ((shift + size / 2) % size), y, 1, size / 2);
      ctx.fillRect(x + (shift % size), y + size / 2, 1, size / 2);
    } else {
      // 壁紙。**縦に薄い筋**を1本 ―― 細かく描くと 16px では潰れる
      ctx.fillStyle = shade(base, 0.05);
      ctx.fillRect(x + (view.cell.x % 2 === 0 ? size * 0.3 : size * 0.7), y, 1, size);
    }
    if (!same.down) {
      const skirt = Math.max(2, Math.round(size / 5));
      ctx.fillStyle = shade(base, -0.2);
      ctx.fillRect(x, y + size - skirt, size, skirt);
      ctx.fillStyle = shade(base, 0.12);
      ctx.fillRect(x, y + size - skirt, size, 1);
    }
    return;
  }

  if (view.hint === "S") {
    // カウンター。天面を明るく、前面を暗く、継ぎ目を1本
    if (!same.up) {
      ctx.fillStyle = shade(base, 0.12);
      ctx.fillRect(x, y, size, face);
      ctx.fillStyle = shade(base, 0.22);
      ctx.fillRect(x, y, size, 1);
    }
    if (!same.down) {
      ctx.fillStyle = shade(base, -0.16);
      ctx.fillRect(x, y + size - face, size, face);
      ctx.fillStyle = shade(base, -0.3);
      ctx.fillRect(x, y + size - face, size, 1);
    }
    // 板の継ぎ目。**マスごとに1本**なので、並べると等間隔の板になる
    ctx.fillStyle = shade(base, -0.1);
    ctx.fillRect(x + size - 1, y + (same.up ? 0 : face), 1, size - (same.up ? 0 : face));
    return;
  }

  if (view.hint === "C" || view.hint === "M") {
    // パソコン（C）と機械・棚（M）。**上の面に画面、下の面に台。**
    if (!same.up) {
      const w = Math.round(size * 0.7);
      const h = Math.round(size * 0.42);
      ctx.fillStyle = shade(base, -0.34);
      ctx.fillRect(x + (size - w) / 2, y + Math.round(size * 0.18), w, h);
      ctx.fillStyle = shade(base, 0.3);
      ctx.fillRect(x + (size - w) / 2 + 1, y + Math.round(size * 0.18) + 1, w - 2, 2);
      // 動いている印のランプを2つ（機械は光っているもの）
      ctx.fillStyle = view.hint === "M" ? "#e8d16a" : "#7fd4e8";
      ctx.fillRect(x + (size - w) / 2 + 1, y + Math.round(size * 0.18) + h - 3, 2, 2);
      ctx.fillRect(x + (size + w) / 2 - 3, y + Math.round(size * 0.18) + h - 3, 2, 2);
    } else {
      // 棚板／筐体の横線
      ctx.fillStyle = shade(base, -0.16);
      ctx.fillRect(x + 2, y + Math.round(size / 3), size - 4, 1);
      ctx.fillRect(x + 2, y + Math.round((size * 2) / 3), size - 4, 1);
    }
    if (!same.down) {
      ctx.fillStyle = shade(base, -0.22);
      ctx.fillRect(x, y + size - Math.max(2, Math.round(size / 5)), size, Math.max(2, Math.round(size / 5)));
    }
    return;
  }

  if (view.hint === "B") {
    // ベッド。**枕は上**（原作もそう置いてある）。掛け布団に折り目を1本
    if (!same.up) {
      ctx.fillStyle = "#f2f0e6";
      ctx.fillRect(x + 2, y + 2, size - 4, Math.max(2, Math.round(size / 3)));
      ctx.fillStyle = shade("#f2f0e6", -0.12);
      ctx.fillRect(x + 2, y + 2 + Math.max(2, Math.round(size / 3)) - 1, size - 4, 1);
    } else {
      ctx.fillStyle = shade(base, 0.12);
      ctx.fillRect(x + 2, y + Math.round(size / 2), size - 4, 1);
    }
    if (!same.down) {
      ctx.fillStyle = shade(base, -0.18);
      ctx.fillRect(x, y + size - Math.max(2, Math.round(size / 4)), size, Math.max(2, Math.round(size / 4)));
    }
    return;
  }

  if (view.hint === "t") {
    /*
     * 机（v1.4-b）。**ここは長らく `T`（木）と同じ文字だった。**
     *
     * 通行不可という規則は同じなので誰も困らなかったが、v1.3-f で木に
     * 樹冠を描いた瞬間、**研究所の実験台と自分の家の机が緑の茂みになった。**
     * 見た目を足すと、それまで見えていなかったデータの兼用が見える ――
     * 直したのは絵ではなく凡例のほう（屋内3枚・7マス）。
     */
    ctx.fillStyle = shade(base, 0.14);
    ctx.fillRect(x, y, size, Math.max(2, Math.round(size / 4)));
    ctx.fillStyle = shade(base, 0.24);
    ctx.fillRect(x, y, size, 1);
    if (!same.down) {
      ctx.fillStyle = shade(base, -0.2);
      ctx.fillRect(x, y + size - face, size, face);
    }
    // 天板の木目を1本
    ctx.fillStyle = shade(base, -0.08);
    ctx.fillRect(x + 2, y + Math.round(size / 2), size - 4, 1);
    return;
  }

  if (view.hint === "D") {
    // ドア。枠を1回り内側に置いて、右にノブ
    ctx.fillStyle = shade(base, -0.24);
    ctx.fillRect(x + 2, y + 1, size - 4, size - 1);
    ctx.fillStyle = shade(base, 0.14);
    ctx.fillRect(x + 3, y + 2, size - 6, 1);
    ctx.fillStyle = "#e8d16a";
    ctx.fillRect(x + size - 5, y + Math.round(size / 2), 2, 2);
    return;
  }

  /*
   * 地面（v1.3-f）。**平らな塗りに、ごく薄い斑を1つだけ置く。**
   *
   * 原作の地面には模様があり、こちらは1色で塗っていたので
   * 広い町が「砂色の面」に見えていた。模様を細かく描くと 16px では潰れるので、
   * **マスごとに位置の変わる点を1つ**だけ ―― 並べたときに目が拾う程度でよい。
   */
  const plain = view.hint === undefined || TILE_HINT[view.hint] === undefined;
  if (!view.blocked && plain && view.terrain === "normal") {
    const px = Math.max(1, Math.round(size / 8));
    // 地図の座標から決める。**画面の座標だと歩くたびに動く**（TileView.cell）
    const jx = (view.cell.x * 7 + view.cell.y * 3) % 5;
    const jy = (view.cell.x * 3 + view.cell.y * 5) % 5;
    ctx.fillStyle = shade(base, -0.06);
    ctx.fillRect(x + (jx + 1.5) * (size / 8), y + (jy + 1.5) * (size / 8), px, px);
  }
}
