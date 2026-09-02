/**
 * 手持ちとボックス（v0.8）。
 *
 * 設計の中心は1つだけ ――
 * **1体の個体が同時に複数の器に属することを禁じる**（capture.md §4）。
 *
 * 「手持ちにもボックスにも居る」状態を許すと、片方で進化させ、
 * もう片方で逃がす、といった破綻が静かに入り込む。
 * ここでは器を操作する関数を通してしか出し入れできない形にして、
 * その不変条件を1箇所で守る。
 */

import type { PokemonInstance } from "./types.js";

/** 手持ちの上限。原作どおり6匹。 */
export const PARTY_SIZE = 6;

/**
 * 手持ちとボックス。
 * **同じ uid が両方に現れてはいけない**（`assertNoDuplicates` が守る）。
 */
export type Storage = {
  party: PokemonInstance[];
  box: PokemonInstance[];
};

export const emptyStorage = (): Storage => ({ party: [], box: [] });

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

/** 二重所属が起きていないか。器を触る関数はすべて最後にこれを通す。 */
export function assertNoDuplicates(storage: Storage): void {
  const seen = new Set<string>();
  for (const [where, list] of [["手持ち", storage.party], ["ボックス", storage.box]] as const) {
    for (const p of list) {
      if (seen.has(p.uid)) {
        throw new StorageError(`${where}: 同じ個体が2箇所にある (uid=${p.uid})`);
      }
      seen.add(p.uid);
    }
  }
  if (storage.party.length > PARTY_SIZE) {
    throw new StorageError(`手持ちが ${storage.party.length} 匹（上限 ${PARTY_SIZE}）`);
  }
}

const checked = (storage: Storage): Storage => {
  assertNoDuplicates(storage);
  return storage;
};

export type AddResult = { storage: Storage; to: "party" | "box" };

/**
 * 捕まえた個体を入れる。**手持ちが埋まっていればボックスへ。**
 * どちらに入ったかを返すのは、UI が出す文言が変わるため。
 */
export function addCaught(storage: Storage, instance: PokemonInstance): AddResult {
  if (storage.party.length < PARTY_SIZE) {
    return {
      storage: checked({ ...storage, party: [...storage.party, instance] }),
      to: "party",
    };
  }
  return { storage: checked({ ...storage, box: [...storage.box, instance] }), to: "box" };
}

/** ボックス → 手持ち。手持ちが埋まっていたら入れ替える相手を指定する。 */
export function withdraw(storage: Storage, uid: string, swapWith?: string): Storage {
  const index = storage.box.findIndex((p) => p.uid === uid);
  if (index < 0) throw new StorageError(`ボックスに居ない (uid=${uid})`);
  const target = storage.box[index]!;
  const box = storage.box.filter((_, i) => i !== index);

  if (storage.party.length < PARTY_SIZE) {
    return checked({ party: [...storage.party, target], box });
  }
  if (swapWith === undefined) {
    throw new StorageError("手持ちがいっぱい。入れ替える相手を指定してください");
  }
  const outIndex = storage.party.findIndex((p) => p.uid === swapWith);
  if (outIndex < 0) throw new StorageError(`手持ちに居ない (uid=${swapWith})`);
  const party = [...storage.party];
  const [out] = party.splice(outIndex, 1, target);
  return checked({ party, box: [...box, out!] });
}

/**
 * 手持ち → ボックス。
 * **最後の1匹は預けられない**（手持ちが空になると野生戦が成立しない）。
 */
export function deposit(storage: Storage, uid: string): Storage {
  if (storage.party.length <= 1) throw new StorageError("最後の1匹は あずけられない");
  const index = storage.party.findIndex((p) => p.uid === uid);
  if (index < 0) throw new StorageError(`手持ちに居ない (uid=${uid})`);
  const party = storage.party.filter((_, i) => i !== index);
  return checked({ party, box: [...storage.box, storage.party[index]!] });
}

/** 逃がす。**戻せないので、呼ぶ前に確認するのは UI の責任。** */
export function release(storage: Storage, uid: string): Storage {
  if (storage.party.some((p) => p.uid === uid) && storage.party.length <= 1) {
    throw new StorageError("最後の1匹は にがせない");
  }
  return checked({
    party: storage.party.filter((p) => p.uid !== uid),
    box: storage.box.filter((p) => p.uid !== uid),
  });
}

/** 手持ちの並べ替え。先頭が最初に出る個体になる。 */
export function reorder(storage: Storage, from: number, to: number): Storage {
  if (from < 0 || from >= storage.party.length) throw new RangeError(`invalid index: ${from}`);
  if (to < 0 || to >= storage.party.length) throw new RangeError(`invalid index: ${to}`);
  const party = [...storage.party];
  const [moved] = party.splice(from, 1);
  party.splice(to, 0, moved!);
  return checked({ ...storage, party });
}

/** 器のどこかに居る全個体。検証と図鑑の集計に使う。 */
export const allInstances = (storage: Storage): PokemonInstance[] => [
  ...storage.party,
  ...storage.box,
];

export const findInstance = (storage: Storage, uid: string): PokemonInstance | null =>
  allInstances(storage).find((p) => p.uid === uid) ?? null;

/** 個体を1体だけ差し替える（進化・レベルアップの反映）。 */
export function replaceInstance(storage: Storage, next: PokemonInstance): Storage {
  const swap = (list: PokemonInstance[]) => list.map((p) => (p.uid === next.uid ? next : p));
  return checked({ party: swap(storage.party), box: swap(storage.box) });
}
