/**
 * 手元のファイル名 → 絵の名前（v1.6-c）。
 *
 * **ここを試験にした理由。** 判定はスマホ（設定画面）とパソコン（`collect-art.ts`）の
 * 両方から呼ぶ1つの関数で、**画面越しには確かめきれない** ――
 * Playwright の `setInputFiles` は日本語のファイル名を黙って落とす
 * （実測した。ゲームの問題ではなく道具の問題）。
 * 名前の判定そのものは、画面を通さずここで見る。
 */

import { describe, expect, it } from "vitest";
import { allSpecies, allMaps, allTrainers } from "@pkmn/data";
import { buildIndex, matchArtName } from "../src/art/match.js";
import { allSlots } from "../src/art/slots.js";

const index = buildIndex(allSpecies);
const known = new Set(
  allSlots({ species: allSpecies, maps: allMaps, trainers: allTrainers }).map((s) => s.name),
);
const match = (file: string) => matchArtName(file, index, known);

describe("素材のファイル名", () => {
  it("すでに当たっている名前は触らない", () => {
    // **正しく名付けた人のファイルを読み替えない。**
    expect(match("species-pikachu.png")).toEqual({ kind: "already", name: "species-pikachu" });
    expect(match("tile-grass.png")).toEqual({ kind: "already", name: "tile-grass" });
    expect(match("ui-frame.png")).toEqual({ kind: "already", name: "ui-frame" });
    // 向きつきの人も通す
    expect(match("player-down.png")).toEqual({ kind: "already", name: "player-down" });
  });

  it("図鑑番号で当たる（0埋めの有無どちらでも）", () => {
    expect(match("001.png")).toEqual({ kind: "renamed", name: "species-bulbasaur" });
    expect(match("25.gif")).toEqual({ kind: "renamed", name: "species-pikachu" });
  });

  it("英語名・日本語名で当たる", () => {
    expect(match("charizard.png")).toEqual({ kind: "renamed", name: "species-charizard" });
    expect(match("ヒトカゲ.png")).toEqual({ kind: "renamed", name: "species-charmander" });
  });

  it("番号と名前が混ざった並びでも当たる", () => {
    expect(match("122 Mr. Mime.png")).toEqual({ kind: "renamed", name: "species-mr-mime" });
    expect(match("025_Pikachu.png")).toEqual({ kind: "renamed", name: "species-pikachu" });
  });

  it("どこにも当たらないものは unknown", () => {
    expect(match("nazo.png").kind).toBe("unknown");
    expect(match("readme.png").kind).toBe("unknown");
  });

  it("2種に当たる鍵は捨ててあるので、当たらない扱いになる", () => {
    /*
     * **迷ったら決めない。** 例えば「ニドラン」は ♂♀ の2種にまたがる。
     * 鍵を残すと「たまたま先に見つかったほう」が選ばれ、静かに間違った絵が入る
     * ―― 当たらない扱いにして、人に決めてもらう。
     */
    expect(match("ニドラン.png").kind).toBe("unknown");
  });
});
