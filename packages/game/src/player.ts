/**
 * プレイヤーの持ちもの（v0.8 で導入、v0.9 でセーブに繋いだ）。
 *
 * 手持ち・ボックス・図鑑・バッグを1箇所に置く。
 * マップ画面と施設画面は別のモードだが、**同じ手持ちを見る必要がある** ――
 * 捕まえた個体を施設に持ち込めることが v0.8 の完了条件だったため。
 *
 * v0.9 でここが `SaveData` と行き来するようになった。
 * **`SaveData` の形をそのまま持ち歩かない**のは、遊んでいる最中に
 * uid の配列と実体を突き合わせ続けたくないから ―― 出入口だけで変換する。
 */

import {
  createMemorySaveStore,
  emptySave,
  emptyStorage,
  resolveParty,
  storeParty,
  type DexEntryState,
  type DexState,
  type Direction,
  type SaveData,
  type SaveStore,
  type Storage,
} from "@pkmn/core";
import { mapId } from "@pkmn/data";

export type Place = { map: string; x: number; y: number; facing: Direction };

export type PlayerState = {
  storage: Storage;
  dex: Record<string, DexState>;
  /** 道具の在庫。`core` はバッグを知らないので、何を何個持つかはこちら側。 */
  bag: Record<string, number>;
  flags: Record<string, boolean>;
  money: number;
  badges: number;
  /** 今いる場所。 */
  position: Place;
  /** 全滅したら戻る場所（economy.md §2）。 */
  respawn: Place;
  /** 冒険を始めているか。false ならセーブに地方の記録が無い。 */
  started: boolean;
};

/** 地方は1つだけ実装済み（v0.10 で拠点と地方選択が入る）。 */
export const REGION = "kanto";
/**
 * 冒険の開始地点。
 *
 * `mapId()` は生成した ID 型を通す恒等関数で、**書き間違いをここで落とす**。
 * 手で書いた ID を型で守れるのはこういう場所だけ（packages/data/src/ids.ts）。
 */
export const START: Place = {
  map: mapId("kanto-players-house-1f"),
  x: 3,
  y: 5,
  facing: "down",
};

export const player: PlayerState = {
  storage: emptyStorage(),
  dex: {},
  // 最初はからっぽ。オーキドがモンスターボールをくれる
  bag: {},
  flags: {},
  money: 3000,
  badges: 0,
  position: { ...START },
  respawn: { ...START },
  started: false,
};

/** セーブ全体。BP・施設の記録など、地方をまたぐぶんもここに入っている。 */
export let save: SaveData = emptySave();

export function setSave(next: SaveData): void {
  save = next;
}

/** セーブ → プレイヤー。読み込みは出入口のここだけ。 */
export function loadPlayer(data: SaveData): void {
  setSave(data);
  const progress = data.regions[REGION];
  const { party, box } = resolveParty(data, REGION);

  player.storage = { party, box };
  player.dex = { ...data.global.dex };
  player.bag = { ...data.global.bag };
  player.flags = { ...(progress?.flags ?? {}) };
  player.money = progress?.money ?? 3000;
  player.badges = progress?.badges ?? 0;
  player.position = progress === undefined ? { ...START } : { ...progress.position };
  player.respawn = progress === undefined ? { ...START } : { ...progress.respawn };
  player.started = progress !== undefined;
}

/**
 * 図鑑をセーブの形に落とす。
 *
 * `DexState` には `"unknown"`（まだ見ていない）があるが、セーブに書くのは
 * 「見た」「捕まえた」だけ ―― **記録の無さが未発見を表す**ので、
 * 未発見をわざわざ書くと意味が二重になる。型もそう宣言されている。
 */
function dexForSave(): Record<string, DexEntryState> {
  const out: Record<string, DexEntryState> = {};
  for (const [species, state] of Object.entries(player.dex)) {
    if (state !== "unknown") out[species] = state;
  }
  return out;
}

/** プレイヤー → セーブ。 */
export function toSave(): SaveData {
  const withWorld = storeParty(
    { ...save, global: { ...save.global, dex: dexForSave(), bag: { ...player.bag } } },
    REGION,
    player.storage.party,
    player.storage.box,
    {
      flags: { ...player.flags },
      money: player.money,
      badges: player.badges,
      position: { ...player.position },
      respawn: { ...player.respawn },
    },
  );
  return withWorld;
}

/** スロットは1つだけ（複数スロットは調整項目・save-data.md §10）。 */
export const SLOT = 0;

/**
 * 保存先。起動時に1度だけ差し替える。
 *
 * 既定を「消えるメモリ」にしてあるのは、**差し替え忘れても遊べなくならない**ため。
 * 保存できているかどうかは設定画面が別に見せる。
 */
let store: SaveStore = createMemorySaveStore();

export function useStore(next: SaveStore): void {
  store = next;
}

export const saveStore = (): SaveStore => store;

/**
 * オートセーブ（save-data.md §6）。
 *
 * ポケモンセンター・マップ遷移・バトル終了・施設の1戦ごとに呼ぶ。
 * **数百時間のプレイを前提にする以上、クラッシュ時の損失は最小にする。**
 * 保存できなくても遊べなくならないよう、失敗は握りつぶして続行する ――
 * ここで例外を投げると、保存できない環境で**歩けなくなる**。
 */
export async function autosave(): Promise<void> {
  try {
    const next = toSave();
    setSave(next);
    await store.save(SLOT, next);
  } catch (error) {
    console.warn("セーブに失敗しました", error);
  }
}

/** 最初から始める。セーブも消す（設定画面から呼ぶ）。 */
export async function resetPlayer(): Promise<void> {
  loadPlayer(emptySave());
  try {
    await store.clear(SLOT);
  } catch (error) {
    console.warn("セーブの削除に失敗しました", error);
  }
}
