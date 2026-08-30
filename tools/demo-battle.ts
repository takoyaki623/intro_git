/**
 * v0.1 のデモ。UI が無くてもバトルが完走することを目で確認するための CLI。
 *
 *   npx vite-node tools/demo-battle.ts -- pikachu geodude 42
 *
 * core はイベント列を返すだけで、演出（この場合はテキスト出力）は外側の責務。
 * 設計: docs/design/ui-flow.md §4
 */

import {
  activeOf,
  chooseRandomAction,
  createBattle,
  createRng,
  requiredSides,
  step,
  type Action,
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

let state = createBattle(gameData, [[specFor(aId)], [specFor(bId)]], seed);

const nameOf = (side: SideIndex) => activeOf(state, side).name;

const STATUS_LABEL: Record<string, string> = {
  poison: "どく", toxic: "もうどく", paralysis: "まひ",
  burn: "やけど", sleep: "ねむり", freeze: "こおり",
};
const BLOCK_LABEL: Record<string, string> = {
  sleep: "眠っている", freeze: "こおっている", paralysis: "体が しびれて 動けない",
  confusion: "わけも わからず 自分を 攻撃した", flinch: "ひるんで 動けない",
};

function render(event: BattleEvent): string | null {
  switch (event.kind) {
    case "switchIn":
      return `${nameOf(event.side)} を くりだした!`;
    case "judged":
      return `  じかんぎれ ―― はんてい（${event.by ?? "ごかく"}）`;
    case "blocked":
      return `  ${nameOf(event.side)} は ${BLOCK_LABEL[event.reason]}`;
    case "wokeUp":
      return `  ${nameOf(event.side)} は 目を覚ました`;
    case "thawed":
      return `  ${nameOf(event.side)} の こおりが とけた`;
    case "snappedOut":
      return `  ${nameOf(event.side)} の 混乱が とけた`;
    case "failed":
      return `  しかし うまく きまらなかった`;
    case "hitCount":
      return `  ${event.hits} 回 当たった!`;
    case "confusionHit":
      return `  自分を 攻撃して ${event.amount} (残り ${event.remainingHp})`;
    case "statusApplied":
      return `  ${nameOf(event.side)} は ${STATUS_LABEL[event.status]} になった`;
    case "confused":
      return `  ${nameOf(event.side)} は 混乱した`;
    case "statusDamage":
      return `  ${nameOf(event.side)} は ${STATUS_LABEL[event.status]} で ${event.amount} (残り ${event.remainingHp})`;
    case "weatherStart":
      return `  天気が ${event.weather} になった`;
    case "weatherDamage":
      return `  ${nameOf(event.side)} は ${event.weather} で ${event.amount} (残り ${event.remainingHp})`;
    case "weatherEnd":
      return `  ${event.weather} が おさまった`;
    case "statChange":
      return `  ${nameOf(event.side)} の ${event.stat} が ${event.delta > 0 ? "あがった" : "さがった"} (${event.stage})`;
    case "statChangeFailed":
      return `  ${nameOf(event.side)} の ${event.stat} は もう変わらない`;
    case "heal":
      return `  ${nameOf(event.side)} は ${event.amount} 回復した (残り ${event.remainingHp})`;
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
      return `  ${nameOf(event.side)} は ${event.amount} 吸い取った`;
    case "faint":
      return `  ${nameOf(event.side)} は たおれた!`;
    case "transformed":
      return `  ${nameOf(event.side)} は ${gameData.species(event.into).name} に へんしん した!`;
    case "battleEnd":
      return event.winner === null
        ? `\n引き分け`
        : `\n${nameOf(event.winner)} の勝ち`;
    case "ability":
      return `  ${nameOf(event.side)} の ${gameData.ability(event.ability).name}!`;
    case "item":
      return `  ${nameOf(event.side)} の ${gameData.item(event.item).name}!`;
    case "itemConsumed":
      return `  ${nameOf(event.side)} の ${gameData.item(event.item).name} は なくなった`;
    case "itemUsed":
      return `  ${gameData.item(event.item).name} を つかった: ${event.text}`;
    case "itemDamage":
      return `  ${nameOf(event.side)} は ${event.amount} 受けた (残り ${event.remainingHp})`;
    case "endured":
      return `  ${nameOf(event.side)} は もちこたえた!`;
    case "cured":
      return `  ${nameOf(event.side)} の 状態が 元に戻った`;
    case "abilityChanged":
      return `  ${nameOf(event.side)} は ${gameData.ability(event.ability).name} になった`;
    case "runFailed":
      return `  ${nameOf(event.side)} は 逃げられなかった`;
    case "escaped":
      return `  ${nameOf(event.side)} は 逃げ出した`;
    case "safariThrown":
      return `  ${event.throw === "bait" ? "エサ" : "イシ"} を投げた`;
    case "fled":
      return `  相手は 逃げていった`;
    case "ballThrown":
      return `  ${event.item} を投げた（${event.shakes}回ゆれた・${event.caught ? "捕獲" : "失敗"}）`;
  }
}

console.log(`${nameOf(0)} (Lv${LEVEL}) vs ${nameOf(1)} (Lv${LEVEL})   seed=${seed}`);

let turns = 0;
while (state.result === null) {
  const rng = createRng(state.rng);
  const actions: [Action | null, Action | null] = [null, null];
  for (const side of requiredSides(state)) {
    actions[side] = chooseRandomAction(gameData, state, side, rng);
  }
  state = { ...state, rng: rng.state() };

  const result = step(gameData, state, actions);
  for (const event of result.events) {
    const line = render(event);
    if (line !== null) console.log(line);
  }
  state = result.state;
  turns++;
}

console.log(`(${turns} ターン / 乱数消費 ${state.rng.calls} 回)`);
