/**
 * AI `random` — 全ての合法手を等確率で選ぶ。
 *
 * v0.1 の完走テスト（1,000戦して例外なく決着する）用。
 * 弱くてよい。思考の深さは v0.5 の `basic` から。
 * 設計: docs/design/ai.md §4
 */

import { legalActions } from "../battle.js";
import type { Rng } from "../rng.js";
import type { Action, BattleState, SideIndex } from "../types.js";

export function chooseRandomAction(
  state: BattleState,
  side: SideIndex,
  rng: Rng,
): Action {
  return rng.pick(legalActions(state, side));
}
