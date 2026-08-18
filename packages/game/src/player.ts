/**
 * プレイヤーの持ちもの（v0.8）。
 *
 * 手持ち・ボックス・図鑑・バッグを1箇所に置く。
 * マップ画面と施設画面は別のモードだが、**同じ手持ちを見る必要がある** ――
 * 捕まえた個体を施設に持ち込めることが v0.8 の完了条件なので、
 * どちらか一方の中に閉じ込めるわけにいかない。
 *
 * **v0.9 でこれは `SaveData` の一部になる。** 今はメモリ上にあるだけで、
 * リロードすると消える（save-data.md §9.6）。
 * そのときここを読み書きしている箇所がそのまま移行の対象になる。
 */

import { emptyStorage, type DexState, type Storage } from "@pkmn/core";

export type PlayerState = {
  storage: Storage;
  dex: Record<string, DexState>;
  /** 道具の在庫。`core` はバッグを知らないので、何を何個持つかはこちら側。 */
  bag: Record<string, number>;
};

export const player: PlayerState = {
  storage: emptyStorage(),
  dex: {},
  // 最初はからっぽ。オーキドがモンスターボールをくれる（ショップは v0.9）
  bag: {},
};
