/**
 * IndexedDB への保存（v0.9）。
 *
 * v0.5 で `SaveStore` を挟んでおいたので、**差し替えたのはこのファイルだけ。**
 * 呼び出し側は1行も変わっていない（save-data.md §2 / game-plan.md §8.3 論点1）。
 *
 * localStorage を捨てた理由は容量。共通ボックスが数千体になると
 * 5MB を超える（save-data.md §4）。
 */

import {
  createMemorySaveStore,
  migrate,
  summarize,
  type PokemonInstance,
  type SaveData,
  type SaveStore,
  type SlotInfo,
} from "@pkmn/core";

const DB_NAME = "pkmn-rpg";
const DB_VERSION = 1;
/** スロットの本体（個体を除いた部分）。 */
const SAVES = "saves";
/**
 * 個体は別ストアに置く。
 * ボックスに数千体入ったとき、1体入れ替えるたびに全体を書き直さないため。
 */
const POKEMON = "pokemon";

type SlotRecord = {
  slot: number;
  savedAt: number;
  /** `pokemon` を抜いた `SaveData`。 */
  data: Omit<SaveData, "pokemon">;
  /** この保存に属する個体の uid。 */
  uids: string[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVES)) db.createObjectStore(SAVES, { keyPath: "slot" });
      if (!db.objectStoreNames.contains(POKEMON)) db.createObjectStore(POKEMON, { keyPath: "uid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const done = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function createIndexedDbStore(): SaveStore {
  return {
    load: async (slot) => {
      const db = await openDb();
      try {
        const tx = db.transaction([SAVES, POKEMON], "readonly");
        const record = await done<SlotRecord | undefined>(tx.objectStore(SAVES).get(slot));
        if (record === undefined) return null;

        const store = tx.objectStore(POKEMON);
        const pokemon: Record<string, PokemonInstance> = {};
        for (const uid of record.uids) {
          const instance = await done<PokemonInstance | undefined>(store.get(uid));
          if (instance !== undefined) pokemon[uid] = instance;
        }
        // 版の引き上げと正規化は core が持っている。ここは入れ物の話だけ
        return migrate({ ...record.data, pokemon });
      } finally {
        db.close();
      }
    },

    save: async (slot, data) => {
      const db = await openDb();
      try {
        const { pokemon, ...rest } = data;
        const uids = Object.keys(pokemon);
        const tx = db.transaction([SAVES, POKEMON], "readwrite");
        const saves = tx.objectStore(SAVES);
        const store = tx.objectStore(POKEMON);

        // 前回この スロットに属していて、今は居ない個体を消す
        const before = await done<SlotRecord | undefined>(saves.get(slot));
        const alive = new Set(uids);
        for (const uid of before?.uids ?? []) if (!alive.has(uid)) store.delete(uid);

        for (const uid of uids) store.put(pokemon[uid]);
        saves.put({ slot, savedAt: Date.now(), data: rest, uids } satisfies SlotRecord);
        await finished(tx);
      } finally {
        db.close();
      }
    },

    clear: async (slot) => {
      const db = await openDb();
      try {
        const tx = db.transaction([SAVES, POKEMON], "readwrite");
        const saves = tx.objectStore(SAVES);
        const record = await done<SlotRecord | undefined>(saves.get(slot));
        for (const uid of record?.uids ?? []) tx.objectStore(POKEMON).delete(uid);
        saves.delete(slot);
        await finished(tx);
      } finally {
        db.close();
      }
    },

    listSlots: async () => {
      const db = await openDb();
      try {
        const tx = db.transaction(SAVES, "readonly");
        const records = await done<SlotRecord[]>(tx.objectStore(SAVES).getAll());
        return records
          .sort((a, b) => a.slot - b.slot)
          .map(
            (r): SlotInfo => ({
              slot: r.slot,
              savedAt: r.savedAt,
              summary: summarize(migrate({ ...r.data, pokemon: {} })),
            }),
          );
      } finally {
        db.close();
      }
    },
  };
}

/**
 * 保存先を1つ選ぶ。
 *
 * IndexedDB が使えない環境（プライベートモードの一部・古い WebView）でも
 * **遊べなくならない**ようにする。保存できないことは分かる形で伝える
 * （黙って新規データを作らない、の裏返し）。
 */
export function createLocalSaveStore(): SaveStore {
  if (typeof indexedDB === "undefined") {
    console.warn("この環境では セーブできません（IndexedDB が無い）");
    return createMemorySaveStore();
  }
  return createIndexedDbStore();
}

/** 保存先が実際に使えるか。設定画面の表示に使う。 */
export async function saveAvailable(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    (await openDb()).close();
    return true;
  } catch {
    return false;
  }
}
