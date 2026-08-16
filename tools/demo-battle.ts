/**
 * v0.1 のデモ。UI が無くてもバトルが完走することを目で確認するための CLI。
 *
 *   npx vite-node tools/demo-battle.ts -- pikachu geodude 42
 *
 * core はイベント列を返すだけで、演出（この場合はテキスト出力）は外側の責務。
 * 設計: docs/design/ui-flow.md §4
 */

import {
  chooseRandomAction,
  createBattle,
  createRng,
  step,
  type BattleEvent,
  type BattlePokemonSource,
  type SideIndex,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";

const [aId = "pikachu", bId = "bulbasaur", seedArg = "1"] = process.argv.slice(2);
const seed = Number(seedArg);
const LEVEL = 50;

function specFor(id: string): BattlePokemonSource {
  const species = gameData.species(id);
  const moves = species.learnset
    .filter((l) => l.level <= LEVEL)
    .map((l) => l.move)
    .slice(-4);
  return { species: id, level: LEVEL, moves };
}

let state = createBattle(gameData, [specFor(aId), specFor(bId)], seed);

const nameOf = (side: SideIndex) => state.sides[side].active.name;

function render(event: BattleEvent): string | null {
  switch (event.kind) {
    case "turnStart":
      return `\n── ターン ${event.turn} ──`;
    case "moveUsed":
      return `${nameOf(event.side)} の ${gameData.move(event.move).name}!`;
    case "struggle":
      return `${nameOf(event.side)} は わるあがき!`;
    case "missed":
      return `  しかし 外れた`;
    case "noEffect":
      return `  ${nameOf(event.side)} には 効果が ないようだ`;
    case "damage": {
      const marks =
        event.effectiveness > 1 ? "  効果は 抜群だ!" :
        event.effectiveness < 1 ? "  効果は いまひとつのようだ" : "";
      const crit = event.critical ? "  急所に 当たった!" : "";
      return `  ${nameOf(event.side)} に ${event.amount} ダメージ (残り ${event.remainingHp})${marks}${crit}`;
    }
    case "recoil":
      return `  ${nameOf(event.side)} は 反動で ${event.amount} 受けた (残り ${event.remainingHp})`;
    case "drain":
      return `  ${nameOf(event.side)} は ${event.amount} 回復した`;
    case "faint":
      return `  ${nameOf(event.side)} は たおれた!`;
    case "battleEnd":
      return event.winner === null
        ? `\n引き分け`
        : `\n${nameOf(event.winner)} の勝ち`;
  }
}

console.log(`${nameOf(0)} (Lv${LEVEL}) vs ${nameOf(1)} (Lv${LEVEL})   seed=${seed}`);

let turns = 0;
while (state.result === null) {
  const rng = createRng(state.rng);
  const a0 = chooseRandomAction(state, 0, rng);
  const a1 = chooseRandomAction(state, 1, rng);
  state = { ...state, rng: rng.state() };

  const result = step(gameData, state, [a0, a1]);
  for (const event of result.events) {
    const line = render(event);
    if (line !== null) console.log(line);
  }
  state = result.state;
  turns++;
}

console.log(`(${turns} ターン / 乱数消費 ${state.rng.calls} 回)`);
