/**
 * localStorage への保存（v0.5 の暫定実装）。
 *
 * **v0.9 で IndexedDB に差し替える。** そのとき書き換えるのはこのファイルだけ。
 * SaveStore を最初から挟んであるので、呼び出し側は一行も変わらない。
 * 設計: docs/design/save-data.md §2 / docs/game-plan.md §8.3 論点1
 */

import { migrate, type SaveData, type SaveStore } from "@pkmn/core";

const KEY = (slot: number) => `pkmn-rpg/save/${slot}`;

export function createLocalSaveStore(): SaveStore {
  return {
    load: async (slot) => {
      try {
        const raw = localStorage.getItem(KEY(slot));
        if (raw === null) return null;
        return migrate(JSON.parse(raw) as unknown);
      } catch {
        // 壊れていても黙って新規データを作らない。読めなかったことを null で伝える
        return null;
      }
    },
    save: async (slot, data: SaveData) => {
      try {
        localStorage.setItem(KEY(slot), JSON.stringify(data));
      } catch {
        // 容量超過やプライベートモード。ゲームは続行できる
        console.warn("セーブに失敗しました（保存先が使えません）");
      }
    },
    clear: async (slot) => {
      localStorage.removeItem(KEY(slot));
    },
  };
}
