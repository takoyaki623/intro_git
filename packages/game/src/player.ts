/**
 * プレイヤーの持ちもの（v0.8 で導入、v0.9 でセーブに繋ぎ、v0.10 で地方をまたいだ）。
 *
 * 手持ち・ボックス・図鑑・バッグを1箇所に置く。
 * マップ画面と施設画面は別の場所だが、**同じ手持ちを見る必要がある** ――
 * 捕まえた個体を施設に持ち込めることが v0.8 の完了条件だったため。
 *
 * v0.9 でここが `SaveData` と行き来するようになった。
 * **`SaveData` の形をそのまま持ち歩かない**のは、遊んでいる最中に
 * uid の配列と実体を突き合わせ続けたくないから ―― 出入口だけで変換する。
 *
 * v0.10 で**居場所が2種類になった**。
 *
 *   地方に居る（`region !== null`）… 手持ち＋地方ボックス。進行フラグ・お金・バッジがある
 *   拠点に居る（`region === null`）… 手持ち＋**共通ボックス**。進行という概念が無い
 *
 * どちらも `player.storage` を見る形にしてあるので、
 * マップ画面もバトル画面も「今どちらに居るか」を知らなくてよい。
 */

import {
  createMemorySaveStore,
  emptySave,
  emptyStorage,
  levelOf,
  resolveCommonBox,
  resolveParty,
  sendToCommonBox,
  storeCommonBox,
  storeParty,
  type DexEntryState,
  type DexState,
  type Direction,
  type HallOfFameEntry,
  type SaveData,
  type SaveStore,
  type Storage,
} from "@pkmn/core";
import { gameData, mapId, regionById } from "@pkmn/data";

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
  /** 全滅したら戻る場所（economy.md §2）。拠点では使わない。 */
  respawn: Place;
  /**
   * 今どの地方に居るか。**`null` は拠点**（v0.10）。
   * `storage.box` が地方ボックスか共通ボックスかも、これで決まる。
   */
  region: string | null;
  /** その地方の冒険を始めているか。false ならセーブに地方の記録が無い。 */
  started: boolean;
};

/**
 * 拠点の入口。**どの地方にも属さない場所**なので、地方の定義には無い。
 *
 * `mapId()` は生成した ID 型を通す恒等関数で、**書き間違いをここで落とす**。
 * 手で書いた ID を型で守れるのはこういう場所だけ（packages/data/src/ids.ts）。
 */
export const HUB: Place = { map: mapId("hub-plaza"), x: 8, y: 12, facing: "down" };

/** その地方の冒険の開始地点。データが持っている（regions.json）。 */
export function startOf(region: string): Place {
  const start = regionById(region).start;
  if (start === undefined) throw new Error(`${region}: start が無い`);
  return { ...start };
}

export const player: PlayerState = {
  storage: emptyStorage(),
  dex: {},
  // 最初はからっぽ。オーキドがモンスターボールをくれる
  bag: {},
  flags: {},
  money: 3000,
  badges: 0,
  position: { ...HUB },
  respawn: { ...HUB },
  region: null,
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
  player.dex = { ...data.global.dex };
  player.bag = { ...data.global.bag };
  player.region = data.global.currentRegion;

  if (player.region === null) enterHubState();
  else enterRegionState(player.region);
}

/** 拠点に居る状態をセーブから作る。 */
function enterHubState(): void {
  // 拠点の「手持ち」という概念は無い。共通ボックスから編成して施設へ入る
  player.storage = { party: [], box: resolveCommonBox(save) };
  player.flags = {};
  player.money = 0;
  player.badges = 0;
  player.position = { ...HUB };
  player.respawn = { ...HUB };
  player.started = true;
}

/** ある地方に居る状態をセーブから作る。 */
function enterRegionState(region: string): void {
  const progress = save.regions[region];
  const { party, box } = resolveParty(save, region);
  const start = startOf(region);

  player.storage = { party, box };
  player.flags = { ...(progress?.flags ?? {}) };
  player.money = progress?.money ?? 3000;
  player.badges = progress?.badges ?? 0;
  player.position = progress === undefined ? { ...start } : { ...progress.position };
  player.respawn = progress === undefined ? { ...start } : { ...progress.respawn };
  player.started = progress !== undefined;
}

/**
 * 地方へ入る（v0.10）。
 *
 * **今いる場所を保存してから移る。** 拠点で編成した手持ちを持ち込むことはできない
 * ―― 地方は現地のポケモンで攻略する、というのが地方独立制の核心（capture.md §4）。
 */
export function enterRegion(region: string): void {
  setSave(toSave());
  setSave({ ...save, global: { ...save.global, currentRegion: region } });
  player.region = region;
  enterRegionState(region);
}

/** 拠点へ戻る。地方の進行はセーブに残り、次に入ったとき続きから始まる。 */
export function returnToHub(): void {
  setSave(toSave());
  setSave({ ...save, global: { ...save.global, currentRegion: null } });
  player.region = null;
  enterHubState();
}

/**
 * 共通ボックスへ送る（一方通行・capture.md §4.1）。
 *
 * 地方チャレンジ中でも送れる。引き出せるのは拠点だけ。
 * 送った個体は地方の器から外れるので、`player.storage` も作り直す。
 */
export function sendToStorage(uids: readonly string[]): void {
  if (player.region === null) return;
  setSave(sendToCommonBox(toSave(), uids));
  enterRegionState(player.region);
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
  const withGlobal: SaveData = {
    ...save,
    global: { ...save.global, dex: dexForSave(), bag: { ...player.bag } },
  };

  // 拠点では地方の記録を触らない。**進行という概念が無い場所で
  // `RegionProgress` を書くと、居もしない地方の記録が生える**
  if (player.region === null) {
    return storeCommonBox(withGlobal, player.storage.party, player.storage.box);
  }

  return storeParty(withGlobal, player.region, player.storage.party, player.storage.box, {
    flags: { ...player.flags },
    money: player.money,
    badges: player.badges,
    position: { ...player.position },
    respawn: { ...player.respawn },
  });
}

/**
 * 殿堂入りを記録する（v1.0）。
 *
 * **そのときの手持ちを写す。** uid で参照すると、逃がしたり進化させたりした
 * あとに殿堂の記録が変わってしまう ―― 殿堂は「そのとき何を連れていたか」なので、
 * あとから動いてはいけない。
 */
export function recordHallOfFame(region: string): HallOfFameEntry {
  const past = save.global.hallOfFame.filter((e) => e.region === region).length;
  const entry: HallOfFameEntry = {
    region,
    count: past + 1,
    at: Date.now(),
    party: player.storage.party.map((p) => ({
      species: p.species,
      nickname: p.nickname ?? null,
      level: levelOf(gameData, p),
      shiny: p.shiny,
    })),
  };
  // 新しいものが先頭
  save = { ...save, global: { ...save.global, hallOfFame: [entry, ...save.global.hallOfFame] } };
  return entry;
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
