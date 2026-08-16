/**
 * バトルエンジン。
 *
 * 「状態 + 入力 → 新しい状態 + イベント列」の純関数として表現する。
 * 呼び出し元の state は変更しない。core は時間の概念を持たない。
 * 設計: docs/design/battle-system.md §1・§2・§3
 */

import { calcDamage } from "./damage.js";
import { applyEffect, type EffectContext } from "./effects.js";
import type { GameData } from "./gamedata.js";
import { toBattlePokemon, type BattlePokemonSource } from "./normalize.js";
import { createRng, createRngState, type Rng } from "./rng.js";
import type {
  Action,
  BattleEvent,
  BattleState,
  Move,
  SideIndex,
  StepResult,
} from "./types.js";

/** PP が尽きたときの代替行動。これが無いとバトルが終わらなくなる。 */
const STRUGGLE: Move = {
  id: "struggle",
  name: "わるあがき",
  type: "normal",
  category: "physical",
  power: 50,
  accuracy: null,
  pp: 1,
  priority: 0,
  target: "foe",
};
/** わるあがきの反動は与ダメージではなく最大HPの割合（第5世代以降）。 */
const STRUGGLE_RECOIL_RATIO = 1 / 4;

/**
 * 無限ループの検出。決着しないバトルはバグなので、黙って引き分けにせず投げる。
 * v0.1 の完了条件（1,000戦が例外なく決着する）を意味あるものにするための番人。
 */
const MAX_TURNS = 1000;

export function createBattle(
  data: GameData,
  sources: [BattlePokemonSource, BattlePokemonSource],
  seed: number,
): BattleState {
  return {
    sides: [
      { active: toBattlePokemon(data, sources[0]) },
      { active: toBattlePokemon(data, sources[1]) },
    ],
    turn: 0,
    rng: createRngState(seed),
    result: null,
  };
}

/** その側が選べる行動。AI と UI はこれを使う。 */
export function legalActions(state: BattleState, side: SideIndex): Action[] {
  const active = state.sides[side].active;
  const usable = active.moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.pp > 0)
    .map(({ i }) => ({ kind: "move", moveIndex: i }) satisfies Action);

  // 全ての PP が尽きた場合も「技を選ぶ」形は保つ（実際にはわるあがきになる）
  return usable.length > 0 ? usable : [{ kind: "move", moveIndex: 0 }];
}

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

/** 行動順の決定: 優先度 → 実効素早さ → 同速は乱数。 */
function turnOrder(
  data: GameData,
  state: BattleState,
  moves: [Move, Move],
  rng: Rng,
): [SideIndex, SideIndex] {
  const p0 = moves[0].priority;
  const p1 = moves[1].priority;
  if (p0 !== p1) return p0 > p1 ? [0, 1] : [1, 0];

  const s0 = state.sides[0].active.stats.spe;
  const s1 = state.sides[1].active.stats.spe;
  if (s0 !== s1) return s0 > s1 ? [0, 1] : [1, 0];

  return rng.chance(0.5) ? [0, 1] : [1, 0];
}

function performMove(
  data: GameData,
  state: BattleState,
  attacker: SideIndex,
  move: Move,
  isStruggle: boolean,
  rng: Rng,
  events: BattleEvent[],
): void {
  const defender = other(attacker);
  const self = state.sides[attacker].active;
  const foe = state.sides[defender].active;

  events.push(
    isStruggle
      ? { kind: "struggle", side: attacker }
      : { kind: "moveUsed", side: attacker, move: move.id },
  );

  // 命中判定（accuracy が null なら必中）
  if (move.accuracy !== null && !rng.chance(move.accuracy / 100)) {
    events.push({ kind: "missed", side: attacker });
    return;
  }

  const result = calcDamage(data, self, foe, move, rng, { typeless: isStruggle });

  if (result.effectiveness === 0) {
    events.push({ kind: "noEffect", side: defender });
    return;
  }

  const before = foe.currentHp;
  foe.currentHp = Math.max(0, before - result.damage);
  events.push({
    kind: "damage",
    side: defender,
    amount: before - foe.currentHp,
    remainingHp: foe.currentHp,
    effectiveness: result.effectiveness,
    critical: result.critical,
  });

  const dealt = before - foe.currentHp;

  if (isStruggle) {
    const recoil = Math.max(1, Math.floor(self.maxHp * STRUGGLE_RECOIL_RATIO));
    const hpBefore = self.currentHp;
    self.currentHp = Math.max(0, hpBefore - recoil);
    events.push({
      kind: "recoil",
      side: attacker,
      amount: hpBefore - self.currentHp,
      remainingHp: self.currentHp,
    });
    return;
  }

  if (move.effect !== undefined) {
    const ctx: EffectContext = {
      data,
      state,
      attacker,
      defender,
      damageDealt: dealt,
      rng,
      events,
    };
    applyEffect(move.effect, ctx);
  }
}

/** ひんし判定。決着したら result を立てる。 */
function checkFaint(state: BattleState, events: BattleEvent[]): boolean {
  const fainted: SideIndex[] = [];
  for (const side of [0, 1] as const) {
    if (state.sides[side].active.currentHp <= 0) fainted.push(side);
  }
  if (fainted.length === 0) return false;

  for (const side of fainted) events.push({ kind: "faint", side });

  // v0.1 は手持ち1体のみ。相打ちは引き分け（交代は v0.2）
  const winner: SideIndex | null = fainted.length === 2 ? null : other(fainted[0]!);
  state.result = { winner };
  events.push({ kind: "battleEnd", winner });
  return true;
}

export function step(
  data: GameData,
  state: BattleState,
  actions: [Action, Action],
): StepResult {
  if (state.result !== null) {
    throw new Error("battle is already over");
  }

  const draft: BattleState = structuredClone(state);
  const rng = createRng(draft.rng);
  const events: BattleEvent[] = [];

  draft.turn += 1;
  if (draft.turn > MAX_TURNS) {
    throw new Error(`battle exceeded ${MAX_TURNS} turns without a result`);
  }
  events.push({ kind: "turnStart", turn: draft.turn });

  // 使用する技を確定する（PP が全滅していればわるあがき）
  const chosen = ([0, 1] as const).map((side) => {
    const action = actions[side];
    if (action.kind !== "move") {
      throw new Error(`action "${action.kind}" is not implemented in v0.1`);
    }
    const active = draft.sides[side].active;
    const anyPp = active.moves.some((m) => m.pp > 0);
    if (!anyPp) return { move: STRUGGLE, isStruggle: true, slotIndex: -1 };

    const slot = active.moves[action.moveIndex];
    if (slot === undefined) throw new RangeError(`invalid move index: ${action.moveIndex}`);
    if (slot.pp <= 0) throw new Error(`move "${slot.id}" has no PP left`);
    return { move: data.move(slot.id), isStruggle: false, slotIndex: action.moveIndex };
  }) as [
    { move: Move; isStruggle: boolean; slotIndex: number },
    { move: Move; isStruggle: boolean; slotIndex: number },
  ];

  const order = turnOrder(data, draft, [chosen[0].move, chosen[1].move], rng);

  for (const side of order) {
    if (draft.result !== null) break;
    if (draft.sides[side].active.currentHp <= 0) continue;

    const { move, isStruggle, slotIndex } = chosen[side];
    if (!isStruggle) {
      const slot = draft.sides[side].active.moves[slotIndex]!;
      slot.pp -= 1;
    }

    performMove(data, draft, side, move, isStruggle, rng, events);
    checkFaint(draft, events);
  }

  draft.rng = rng.state();
  return { state: draft, events };
}
