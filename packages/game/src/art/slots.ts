/**
 * 素材を入れられる**口の一覧**（v1.6）。
 *
 * 口は v0.10.5 から開いていたが、**どんな名前を付ければ当たるのかが
 * どこにも書いていなかった。** 設定画面の説明にあったのは
 * 「`tile-T.png` なら木のマス」という例が2つだけで、
 * ポケモン228種ぶんの名前は**誰も知りようがなかった** ――
 * 口が開いていることと、入れられることは別。
 *
 * ## 一覧は数えて作る。書かない
 *
 * ここで名前を手で並べると、種を足したときに**ここだけ古くなる**
 * （v1.1-j で「名前を手で書ける場所を1つずつ潰す」と決めたのと同じ）。
 * 種族・マップ・トレーナーのデータから数えて出す。
 *
 * ## 素材そのものは入っていない
 *
 * §10 のとおり、公式素材はこのリポジトリにも配る版にも入らない。
 * ここが作るのは**名前の一覧だけ**で、絵は利用者が自分の端末から入れる。
 */

import { TERRAINS } from "@pkmn/core";
import type { MapData, MapObject } from "@pkmn/core";
import { TILE_HINT } from "./tiles.js";

export type SlotGroup = "ポケモン" | "マス" | "ひと" | "まど・はいけい";

export type Slot = {
  /** 絵の名前。**ファイル名から拡張子を取ったもの**（`store.ts` の `artName`）。 */
  name: string;
  /** 画面に出す説明。 */
  label: string;
  group: SlotGroup;
};

/** 窓・HP箱・背景（`source.ts` の `SKINS` と同じ名前）。 */
const UI_SLOTS: readonly Slot[] = [
  { name: "ui-frame", label: "会話・メニューの窓の枠", group: "まど・はいけい" },
  { name: "ui-frame-battle", label: "バトルの下段の窓の枠", group: "まど・はいけい" },
  { name: "ui-hpbox-foe", label: "相手の HP箱", group: "まど・はいけい" },
  { name: "ui-hpbox-own", label: "自分の HP箱", group: "まど・はいけい" },
  { name: "battle-bg", label: "バトルの背景", group: "まど・はいけい" },
];

/**
 * 全部の口を並べる。
 *
 * **人は向きごとにも受け取れる**（`npc-oak-down` のように）が、
 * 一覧には向き無しの名前だけ出す ―― 4倍の行を出しても読めない。
 */
export function allSlots(input: {
  species: readonly { id: string; name: string }[];
  maps: readonly MapData[];
  trainers: readonly { id: string; name: string; class: string }[];
}): readonly Slot[] {
  const slots: Slot[] = [];

  for (const s of input.species) {
    slots.push({ name: `species-${s.id}`, label: s.name, group: "ポケモン" });
  }

  // マス。凡例の文字と地形名の**両方**が口になる（`tiles.ts` の `drawTile`）
  for (const hint of Object.keys(TILE_HINT)) {
    slots.push({ name: `tile-${hint}`, label: `凡例「${hint}」`, group: "マス" });
  }
  for (const terrain of TERRAINS) {
    slots.push({ name: `tile-${terrain}`, label: `地形「${terrain}」`, group: "マス" });
  }

  slots.push({ name: "player", label: "主人公", group: "ひと" });
  const seen = new Set<string>();
  for (const map of input.maps) {
    for (const object of map.objects as readonly MapObject[]) {
      if (object.kind.type !== "npc" || seen.has(object.kind.sprite)) continue;
      seen.add(object.kind.sprite);
      slots.push({ name: `npc-${object.kind.sprite}`, label: object.kind.sprite, group: "ひと" });
    }
  }
  for (const t of input.trainers) {
    slots.push({ name: `npc-${t.id}`, label: `${t.class} ${t.name}`, group: "ひと" });
  }

  slots.push(...UI_SLOTS);
  return slots;
}
