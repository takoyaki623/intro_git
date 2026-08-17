/**
 * 特性・持ち物（v0.5）。
 *
 * 「フックとレジストリが動き、数十種が正しく機能すること」が v0.5 の完了条件。
 * ここでは各フックの代表を1つずつ通し、機構そのものが働いていることを見る。
 * 設計: docs/design/battle-system.md §12
 */

import { describe, expect, it } from "vitest";
import {
  calcDamage,
  createBattle,
  createRng,
  createRngState,
  heldHandlers,
  legalActions,
  step,
  toBattlePokemon,
  type BattleEvent,
  type BattlePokemonSource,
  type HeldEffect,
} from "@pkmn/core";
import { allAbilities, allItems, gameData } from "@pkmn/data";

const rng = () => createRng(createRngState(4242));
const mon = (source: BattlePokemonSource) => toBattlePokemon(gameData, source);

const spec = (
  species: string,
  moves: string[],
  extra: Partial<BattlePokemonSource> = {},
): BattlePokemonSource => ({ species, level: 50, moves, ...extra });

/** 1ターン進めてイベント列を得る。 */
function turn(
  a: BattlePokemonSource,
  b: BattlePokemonSource,
  seed = 7,
  actions: [number, number] = [0, 0],
): { events: BattleEvent[]; state: ReturnType<typeof createBattle> } {
  const state = createBattle(gameData, [[a], [b]], seed);
  const result = step(gameData, state, [
    { kind: "move", moveIndex: actions[0] },
    { kind: "move", moveIndex: actions[1] },
  ]);
  return { events: result.events, state: result.state };
}

const has = (events: readonly BattleEvent[], kind: BattleEvent["kind"]) =>
  events.some((e) => e.kind === kind);

describe("レジストリ", () => {
  it("データが使う全ての効果にハンドラが登録されている", () => {
    const kinds = new Set<HeldEffect["kind"]>();
    for (const a of allAbilities) kinds.add(a.effect.kind);
    for (const i of allItems) if (i.held !== undefined) kinds.add(i.held.kind);

    expect(kinds.size).toBeGreaterThan(20);
    for (const kind of kinds) {
      expect(heldHandlers[kind], `ハンドラが無い: ${kind}`).toBeDefined();
    }
  });

  it("特性を持たない指定でも既定特性が入る", () => {
    // 指定しなければ種族の1つ目。BattleSet 以外の出どころのための既定値
    expect(mon(spec("bulbasaur", ["tackle"])).ability).toBe("overgrow");
    expect(mon(spec("bulbasaur", ["tackle"], { ability: "chlorophyll" })).ability).toBe(
      "chlorophyll",
    );
  });

  it("inert な特性は理由を必ず持つ", () => {
    for (const a of allAbilities) {
      if (a.effect.kind !== "inert") continue;
      expect(a.effect.reason.length, `${a.id} に理由が無い`).toBeGreaterThan(0);
    }
  });
});

describe("ダメージへのフック", () => {
  it("タイプ強化アイテムは該当タイプの技だけを強化する", () => {
    const plain = mon(spec("charmander", ["ember"]));
    const boosted = mon(spec("charmander", ["ember"], { item: "charcoal" }));
    const target = mon(spec("rattata", ["tackle"]));
    const opts = { forceCritical: false, forceRandom: 100 } as const;

    const a = calcDamage(gameData, plain, target, gameData.move("ember"), rng(), opts);
    const b = calcDamage(gameData, boosted, target, gameData.move("ember"), rng(), opts);
    expect(b.damage).toBeGreaterThan(a.damage);

    // ノーマル技には乗らない
    const c = calcDamage(gameData, plain, target, gameData.move("tackle"), rng(), opts);
    const d = calcDamage(gameData, boosted, target, gameData.move("tackle"), rng(), opts);
    expect(d.damage).toBe(c.damage);
  });

  it("ピンチ特性は HP が 1/3 以下のときだけ働く", () => {
    const full = mon(spec("charmander", ["ember"]));
    const pinch = mon(spec("charmander", ["ember"]));
    pinch.currentHp = Math.floor(pinch.maxHp / 3);
    const target = mon(spec("rattata", ["tackle"]));
    const opts = { forceCritical: false, forceRandom: 100 } as const;
    const move = gameData.move("ember");

    expect(calcDamage(gameData, pinch, target, move, rng(), opts).damage).toBeGreaterThan(
      calcDamage(gameData, full, target, move, rng(), opts).damage,
    );
  });

  it("あついしぼうは ほのお・こおり を半減する", () => {
    const attacker = mon(spec("charmander", ["ember"]));
    const plain = mon(spec("rattata", ["tackle"]));
    const fat = mon(spec("rattata", ["tackle"], { ability: "thick-fat" }));
    const opts = { forceCritical: false, forceRandom: 100 } as const;
    const move = gameData.move("ember");

    expect(calcDamage(gameData, attacker, fat, move, rng(), opts).damage).toBeLessThan(
      calcDamage(gameData, attacker, plain, move, rng(), opts).damage,
    );
  });

  it("こだわりハチマキは こうげき を上げる", () => {
    const plain = mon(spec("rattata", ["tackle"]));
    const band = mon(spec("rattata", ["tackle"], { item: "choice-band" }));
    const target = mon(spec("rattata", ["tackle"]));
    const opts = { forceCritical: false, forceRandom: 100 } as const;
    const move = gameData.move("tackle");

    expect(calcDamage(gameData, band, target, move, rng(), opts).damage).toBeGreaterThan(
      calcDamage(gameData, plain, target, move, rng(), opts).damage,
    );
  });

  it("シェルアーマーは急所を無効にする", () => {
    const attacker = mon(spec("rattata", ["tackle"]));
    const armored = mon(spec("shellder", ["tackle"], { ability: "shell-armor" }));
    const result = calcDamage(gameData, attacker, armored, gameData.move("tackle"), rng(), {
      forceCritical: true,
      forceRandom: 100,
    });
    expect(result.critical).toBe(false);
  });

  it("こんじょうは やけどの威力減少を無視する", () => {
    const burned = mon(spec("machop", ["karate-chop"]));
    burned.status = "burn";
    const healthy = mon(spec("machop", ["karate-chop"]));
    const target = mon(spec("rattata", ["tackle"]));
    const opts = { forceCritical: false, forceRandom: 100 } as const;
    const move = gameData.move("karate-chop");

    // 減少を無視した上に こうげき1.5倍 が乗るので、やけどの方が強い
    expect(calcDamage(gameData, burned, target, move, rng(), opts).damage).toBeGreaterThan(
      calcDamage(gameData, healthy, target, move, rng(), opts).damage,
    );
  });
});

describe("無効化のフック", () => {
  it("ふゆうは じめん技を無効にする", () => {
    const { events } = turn(
      spec("diglett", ["earthquake"]),
      spec("gastly", ["lick"], { ability: "levitate" }),
    );
    expect(has(events, "noEffect")).toBe(true);
    expect(events.some((e) => e.kind === "ability" && e.ability === "levitate")).toBe(true);
  });

  it("ちょすいは みず技を無効にして回復する", () => {
    const defender = spec("poliwag", ["tackle"], { ability: "water-absorb" });
    const state = createBattle(gameData, [[spec("squirtle", ["water-gun"])], [defender]], 5);
    // 先に削っておかないと回復が起きない
    state.sides[1].party[0]!.currentHp = 10;
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(has(events, "noEffect")).toBe(true);
    expect(events.some((e) => e.kind === "heal" && e.side === 1)).toBe(true);
  });

  it("いしあたまは反動を打ち消す", () => {
    const { events } = turn(spec("geodude", ["take-down"]), spec("rattata", ["tackle"]));
    expect(events.some((e) => e.kind === "recoil" && e.side === 0)).toBe(false);
  });

  it("めんえきは どく にならない", () => {
    const state = createBattle(
      gameData,
      [[spec("bulbasaur", ["toxic"])], [spec("snorlax", ["tackle"])]],
      1,
    );
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "statusApplied" && e.side === 1)).toBe(false);
  });
});

describe("発動するフック", () => {
  it("いかくは場に出たときに相手の こうげき を下げる", () => {
    const state = createBattle(
      gameData,
      [[spec("ekans", ["tackle"])], [spec("rattata", ["tackle"])]],
      9,
    );
    const { events, state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "ability" && e.ability === "intimidate")).toBe(true);
    expect(next.sides[1].party[0]!.statStages.atk).toBe(-1);
  });

  it("たべのこしはターン終了時に回復する", () => {
    const state = createBattle(
      gameData,
      [[spec("snorlax", ["tackle"], { item: "leftovers" })], [spec("rattata", ["tackle"])]],
      3,
    );
    state.sides[0].party[0]!.currentHp = 50;
    const { events } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "item" && e.item === "leftovers")).toBe(true);
  });

  it("きあいのタスキは一撃で倒される攻撃を1で耐え、消費される", () => {
    const state = createBattle(
      gameData,
      [
        [spec("mewtwo", ["psychic"], { level: 100 })],
        [spec("caterpie", ["tackle"], { level: 5, item: "focus-sash" })],
      ],
      2,
    );
    const { events, state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(has(events, "endured")).toBe(true);
    expect(has(events, "itemConsumed")).toBe(true);
    expect(next.sides[1].party[0]!.itemConsumed).toBe(true);
  });

  it("いのちのたまは威力を上げる代わりに反動を受ける", () => {
    const { events } = turn(
      spec("rattata", ["tackle"], { item: "life-orb" }),
      spec("snorlax", ["tackle"]),
    );
    expect(events.some((e) => e.kind === "itemDamage" && e.side === 0)).toBe(true);
  });

  it("ゴツゴツメットは接触技を受けると相手を削る", () => {
    const { events } = turn(
      spec("rattata", ["tackle"]),
      spec("snorlax", ["tackle"], { item: "rocky-helmet" }),
    );
    // たいあたりは接触技なので、攻撃した側(0)が削られる
    expect(events.some((e) => e.kind === "itemDamage" && e.side === 0)).toBe(true);
  });

  it("じしんは非接触なので ゴツゴツメット が反応しない", () => {
    const { events } = turn(
      spec("diglett", ["earthquake"]),
      spec("snorlax", ["tackle"], { item: "rocky-helmet" }),
    );
    expect(events.some((e) => e.kind === "itemDamage" && e.side === 0)).toBe(false);
  });

  it("オボンのみは HP が半分を切ると発動して消える", () => {
    const state = createBattle(
      gameData,
      [[spec("snorlax", ["tackle"], { item: "sitrus-berry" })], [spec("rattata", ["tackle"])]],
      3,
    );
    const self = state.sides[0].party[0]!;
    self.currentHp = Math.floor(self.maxHp / 2);
    const { events, state: next } = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(events.some((e) => e.kind === "item" && e.item === "sitrus-berry")).toBe(true);
    expect(next.sides[0].party[0]!.itemConsumed).toBe(true);
  });

  it("トレースは相手の特性をコピーし、交代で元に戻る", () => {
    const state = createBattle(
      gameData,
      [
        [spec("porygon", ["tackle"]), spec("rattata", ["tackle"])],
        [spec("ekans", ["tackle"])],
      ],
      4,
    );
    const first = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(first.state.sides[0].party[0]!.ability).toBe("intimidate");

    const second = step(gameData, first.state, [
      { kind: "switch", partyIndex: 1 },
      { kind: "move", moveIndex: 0 },
    ]);
    expect(second.state.sides[0].party[0]!.ability).toBe("trace");
  });
});

describe("行動の制限", () => {
  it("こだわり系は最初に選んだ技に固定される", () => {
    const state = createBattle(
      gameData,
      [
        [spec("rattata", ["tackle", "quick-attack"], { item: "choice-band" })],
        [spec("snorlax", ["tackle"])],
      ],
      3,
    );
    expect(legalActions(gameData, state, 0).filter((a) => a.kind === "move")).toHaveLength(2);

    const next = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]).state;
    expect(next.sides[0].party[0]!.volatile.choiceLocked).toBe("tackle");
    const after = legalActions(gameData, next, 0).filter((a) => a.kind === "move");
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual({ kind: "move", moveIndex: 0 });
  });

  it("とつげきチョッキは変化技を選べなくする", () => {
    const state = createBattle(
      gameData,
      [
        [spec("snorlax", ["tackle", "toxic"], { item: "assault-vest" })],
        [spec("rattata", ["tackle"])],
      ],
      3,
    );
    const moves = legalActions(gameData, state, 0).filter((a) => a.kind === "move");
    expect(moves).toHaveLength(1);
  });

  it("じりょくは はがねタイプの交代を封じる", () => {
    const state = createBattle(
      gameData,
      [
        [spec("magnemite", ["tackle"]), spec("rattata", ["tackle"])],
        [spec("magneton", ["tackle"], { ability: "magnet-pull" })],
      ],
      3,
    );
    // コイルは でんき/はがね なので、相手のじりょくで交代できない
    expect(legalActions(gameData, state, 0).some((a) => a.kind === "switch")).toBe(false);
  });
});
