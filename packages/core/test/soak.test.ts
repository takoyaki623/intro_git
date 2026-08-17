/**
 * v0.1 の完了条件そのもの。
 *
 *   1. ランダムAI同士が 1,000 戦して例外なく決着する（無限ループの検出）
 *   2. 同じシードで2回流すと完全に同一の結果になる（決定性）
 *
 * 設計: docs/game-plan.md §9 / docs/design/battle-system.md §13
 */

import { describe, expect, it } from "vitest";
import {
  chooseRandomAction,
  createBattle,
  createRng,
  requiredSides,
  step,
  type Action,
  type BattleEvent,
  type BattlePokemonSource,
} from "@pkmn/core";
import { allSpecies, gameData } from "@pkmn/data";

/** 種族ごとに learnset から技を最大4つ取る。 */
function specFor(speciesId: string, level: number): BattlePokemonSource {
  const species = gameData.species(speciesId);
  const moves = species.learnset
    .filter((l) => l.level <= level)
    .map((l) => l.move)
    .slice(-4);
  return { species: speciesId, level, moves: moves.length > 0 ? moves : ["tackle"] };
}

type Outcome = { winner: number | null; turns: number; events: BattleEvent[] };

function playOut(
  a: readonly BattlePokemonSource[],
  b: readonly BattlePokemonSource[],
  seed: number,
): Outcome {
  let state = createBattle(gameData, [a, b], seed);
  const events: BattleEvent[] = [];
  let turns = 0;

  while (state.result === null) {
    const rng = createRng(state.rng);
    const actions: [Action | null, Action | null] = [null, null];
    for (const side of requiredSides(state)) {
      actions[side] = chooseRandomAction(state, side, rng);
    }
    state = { ...state, rng: rng.state() };

    const result = step(gameData, state, actions);
    state = result.state;
    events.push(...result.events);
    turns++;
  }
  return { winner: state.result.winner, turns, events };
}

describe("完走テスト", () => {
  it("ランダムAI同士が1,000戦して例外なく決着する", () => {
    const ids = allSpecies.map((s) => s.id);
    let draws = 0;
    let maxTurns = 0;

    for (let i = 0; i < 1000; i++) {
      const a = ids[i % ids.length]!;
      const b = ids[(i * 7 + 3) % ids.length]!;
      const level = 20 + (i % 60);

      const c = ids[(i * 13 + 5) % ids.length]!;
      const d = ids[(i * 11 + 9) % ids.length]!;
      const outcome = playOut(
        [specFor(a, level), specFor(c, level)],
        [specFor(b, level), specFor(d, level)],
        i + 1,
      );

      // 決着していること（winner が null の相打ちも「決着」に含む）
      expect(outcome.events.at(-1)?.kind).toBe("battleEnd");
      if (outcome.winner === null) draws++;
      maxTurns = Math.max(maxTurns, outcome.turns);
    }

    // 相打ちは起きうるが、大半を占めるようならバランス以前に計算がおかしい
    expect(draws).toBeLessThan(100);
    // 上限に張り付いていない = わるあがきが効いている
    expect(maxTurns).toBeLessThan(1000);
  });
});

describe("決定性", () => {
  it("同じシードなら完全に同一の結果になる", () => {
    for (const seed of [1, 42, 999, 123456]) {
      const a = [specFor("pikachu", 50), specFor("lapras", 50)];
      const b = [specFor("geodude", 50), specFor("gastly", 50)];
      const first = playOut(a, b, seed);
      const second = playOut(a, b, seed);

      expect(second.winner).toBe(first.winner);
      expect(second.turns).toBe(first.turns);
      expect(second.events).toEqual(first.events);
    }
  });

  it("シードが違えば結果も分岐する", () => {
    const a = [specFor("charmander", 50)];
    const b = [specFor("squirtle", 50)];
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const o = playOut(a, b, seed);
      outcomes.add(`${o.winner}:${o.turns}`);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });
});
