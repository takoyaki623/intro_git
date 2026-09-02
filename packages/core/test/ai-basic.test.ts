/**
 * AI `basic`（v0.5）。
 *
 * AI は「バグっていても動いてしまう」ため、明示的に測る仕組みが要る。
 *  - 相対勝率: basic が random に有意に勝ち越すこと（唯一の客観指標）
 *  - mistakeRate の単調性
 *  - 悪手の回帰テスト
 * 設計: docs/design/ai.md §8
 */

import { describe, expect, it } from "vitest";
import {
  chooseBasicAction,
  chooseRandomAction,
  createBattle,
  createKnowledge,
  createRng,
  createRngState,
  observe,
  requiredSides,
  step,
  toAiView,
  type Action,
  type AiConfig,
  type BattlePokemonSource,
  type SideIndex,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const BASIC: AiConfig = { policy: "basic", mistakeRate: 0, knowledge: "fair" };
const rng = () => createRng(createRngState(1234));

const spec = (
  species: string,
  moves: string[],
  extra: Partial<BattlePokemonSource> = {},
): BattlePokemonSource => ({ species, level: 50, moves, ...extra });

function actionOf(
  own: BattlePokemonSource[],
  foe: BattlePokemonSource[],
  config: AiConfig = BASIC,
  seed = 5,
): Action {
  const state = createBattle(gameData, [own, foe], seed);
  const view = toAiView(gameData, state, 0, config);
  return chooseBasicAction(gameData, view, config, rng());
}

describe("明らかな悪手を打たない", () => {
  it("相性0倍の技を選ばない", () => {
    // ノーマル技はゴーストに通らない。もう1つの技を選ぶはず
    const action = actionOf(
      [spec("rattata", ["tackle", "bite"])],
      [spec("gastly", ["lick"])],
    );
    expect(action).toEqual({ kind: "move", moveIndex: 1 });
  });

  it("効果抜群の技を優先する", () => {
    const action = actionOf(
      [spec("pikachu", ["tackle", "thunderbolt"])],
      [spec("squirtle", ["water-gun"])],
    );
    expect(action).toEqual({ kind: "move", moveIndex: 1 });
  });

  it("満タンの相手に回復技を撃たない", () => {
    const action = actionOf(
      [spec("chansey", ["recover", "dazzling-gleam"])],
      [spec("rattata", ["tackle"])],
    );
    expect(action).toEqual({ kind: "move", moveIndex: 1 });
  });

  it("HP が減っていれば回復技を選ぶ", () => {
    const state = createBattle(
      gameData,
      [[spec("chansey", ["recover", "dazzling-gleam"])], [spec("rattata", ["tackle"])]],
      5,
    );
    const self = state.sides[0].party[0]!;
    self.currentHp = Math.floor(self.maxHp * 0.2);
    const view = toAiView(gameData, state, 0, BASIC);
    expect(chooseBasicAction(gameData, view, BASIC, rng())).toEqual({
      kind: "move",
      moveIndex: 0,
    });
  });

  it("すでに状態異常の相手に状態異常技を撃たない", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunder-wave", "thunder-shock"])], [spec("rattata", ["tackle"])]],
      5,
    );
    state.sides[1].party[0]!.status = "paralysis";
    const view = toAiView(gameData, state, 0, BASIC);
    expect(chooseBasicAction(gameData, view, BASIC, rng())).toEqual({
      kind: "move",
      moveIndex: 1,
    });
  });

  it("倒せる技があれば必ずそれを選ぶ", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunder-shock", "tail-whip"])], [spec("pidgey", ["tackle"])]],
      5,
    );
    state.sides[1].party[0]!.currentHp = 1;
    const view = toAiView(gameData, state, 0, BASIC);
    expect(chooseBasicAction(gameData, view, BASIC, rng())).toEqual({
      kind: "move",
      moveIndex: 0,
    });
  });

  it("PP 切れの技は候補に入らない（legalActions が弾く）", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunderbolt", "tackle"])], [spec("squirtle", ["water-gun"])]],
      5,
    );
    state.sides[0].party[0]!.moves[0]!.pp = 0;
    const view = toAiView(gameData, state, 0, BASIC);
    expect(view.legal.some((a) => a.kind === "move" && a.moveIndex === 0)).toBe(false);
  });
});

describe("AiView（相手の情報が見えない）", () => {
  it("fair では、まだ見ていない控えは見えない", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunderbolt"])], [spec("rattata", ["tackle"]), spec("mewtwo", ["psychic"])]],
      5,
    );
    const view = toAiView(gameData, state, 0, BASIC);
    expect(view.foe.revealedParty).not.toContain("mewtwo");
    // 実数値ではなく割合しか持たない
    expect(view.foe).not.toHaveProperty("stats");
    expect(view.foe.hpRatio).toBe(1);
  });

  it("partial では控えの種族名だけが見える", () => {
    const config: AiConfig = { ...BASIC, knowledge: "partial" };
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunderbolt"])], [spec("rattata", ["tackle"]), spec("mewtwo", ["psychic"])]],
      5,
    );
    const view = toAiView(gameData, state, 0, config);
    expect(view.foe.revealedParty).toContain("mewtwo");
  });

  it("使われた技だけが記録される", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunderbolt"])], [spec("rattata", ["tackle", "bite"])]],
      5,
    );
    const knowledge = createKnowledge();
    const result = step(gameData, state, [
      { kind: "move", moveIndex: 0 },
      { kind: "move", moveIndex: 0 },
    ]);
    observe(knowledge, result.state, result.events, 1);
    expect(knowledge.revealedMoves).toContain("tackle");
    expect(knowledge.revealedMoves).not.toContain("bite");
  });
});

// ─────────────────────────────────────────────
// 相対勝率
// ─────────────────────────────────────────────

/** side 0 が basic、side 1 が random で1戦する。勝った側を返す。 */
function playMatch(
  team: BattlePokemonSource[],
  seed: number,
  config: AiConfig,
): SideIndex | null {
  let state = createBattle(gameData, [team, team], seed);
  let guard = 0;
  while (state.result === null) {
    if (++guard > 400) return null;
    const r = createRng(state.rng);
    const actions: [Action | null, Action | null] = [null, null];
    for (const side of requiredSides(state)) {
      actions[side] =
        side === 0
          ? chooseBasicAction(gameData, toAiView(gameData, state, 0, config), config, r)
          : chooseRandomAction(gameData, state, side, r);
    }
    state = { ...state, rng: r.state() };
    state = step(gameData, state, actions).state;
  }
  return state.result.winner;
}

const TEAM: BattlePokemonSource[] = [
  spec("charizard", ["flamethrower", "dragon-claw", "aerial-ace", "swords-dance"]),
  spec("blastoise", ["surf", "ice-beam", "bite", "recover"]),
  spec("venusaur", ["giga-drain", "sludge-bomb", "sleep-powder", "calm-mind"]),
];

function winRate(config: AiConfig, battles: number): number {
  let wins = 0;
  let decided = 0;
  for (let seed = 1; seed <= battles; seed++) {
    const winner = playMatch(TEAM, seed, config);
    if (winner === null) continue;
    decided++;
    if (winner === 0) wins++;
  }
  return wins / decided;
}

describe("相対勝率（AI が実際に効いているか）", () => {
  it("basic は random に対して有意に勝ち越す", () => {
    const rate = winRate(BASIC, 200);
    // 同じ編成・同じ手持ちなので、差は思考の質だけから来る
    expect(rate).toBeGreaterThan(0.65);
  });

  it("mistakeRate を上げると勝率が下がる（単調性）", () => {
    const strong = winRate(BASIC, 120);
    const sloppy = winRate({ ...BASIC, mistakeRate: 0.8 }, 120);
    expect(sloppy).toBeLessThan(strong);
  });

  it("同じ盤面では必ず同じ行動を返す（決定性）", () => {
    const state = createBattle(
      gameData,
      [[spec("pikachu", ["thunderbolt", "tackle"])], [spec("squirtle", ["water-gun"])]],
      5,
    );
    const view = toAiView(gameData, state, 0, BASIC);
    const first = chooseBasicAction(gameData, view, BASIC, rng());
    const second = chooseBasicAction(gameData, view, BASIC, rng());
    expect(first).toEqual(second);
  });
});
