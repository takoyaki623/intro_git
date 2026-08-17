/**
 * バトルエンジン。
 *
 * 「状態 + 入力 → 新しい状態 + イベント列」の純関数として表現する。
 * 呼び出し元の state は変更しない。core は時間の概念を持たない。
 * 設計: docs/design/battle-system.md §1〜§9
 */

import { calcDamage, rollAccuracy } from "./damage.js";
import { applyEffect, resolveHitCount, type EffectContext } from "./effects.js";
import type { GameData } from "./gamedata.js";
import { toBattlePokemon, type BattlePokemonSource } from "./normalize.js";
import { createRng, createRngState, type Rng } from "./rng.js";
import { battleStageMultiplier } from "./stages.js";
import {
  CONFUSION_SELF_HIT_CHANCE,
  CONFUSION_SELF_HIT_POWER,
  onSwitchOut,
  PARALYSIS_BLOCK_CHANCE,
  PARALYSIS_SPEED_MULTIPLIER,
  residualDamage,
  THAW_CHANCE,
} from "./status.js";
import type {
  Action,
  BattleEvent,
  BattlePokemon,
  BattleState,
  Move,
  Side,
  SideIndex,
  StepResult,
} from "./types.js";
import { EMPTY_STAGES } from "./types.js";

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

/** 決着しないバトルはバグなので、黙って引き分けにせず投げる。 */
const MAX_TURNS = 1000;

export function createBattle(
  data: GameData,
  parties: [readonly BattlePokemonSource[], readonly BattlePokemonSource[]],
  seed: number,
): BattleState {
  const build = (sources: readonly BattlePokemonSource[]): Side => {
    if (sources.length === 0) throw new Error("party must not be empty");
    return { party: sources.map((s) => toBattlePokemon(data, s)), activeIndex: 0 };
  };
  return {
    sides: [build(parties[0]), build(parties[1])],
    turn: 0,
    rng: createRngState(seed),
    result: null,
    pendingSwitch: [],
  };
}

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

export function activeOf(state: BattleState, side: SideIndex): BattlePokemon {
  return state.sides[side].party[state.sides[side].activeIndex]!;
}

const isAlive = (p: BattlePokemon) => p.currentHp > 0;

/** その側が選べる行動。AI と UI はこれを使う。 */
export function legalActions(state: BattleState, side: SideIndex): Action[] {
  // 交代要求中は交代しか選べない
  if (state.pendingSwitch.includes(side)) {
    return state.sides[side].party
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => isAlive(p) && i !== state.sides[side].activeIndex)
      .map(({ i }) => ({ kind: "switch", partyIndex: i }) satisfies Action);
  }
  if (state.pendingSwitch.length > 0) return []; // 相手の交代待ち

  const active = activeOf(state, side);
  const moves = active.moves
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.pp > 0)
    .map(({ i }) => ({ kind: "move", moveIndex: i }) satisfies Action);

  const switches = state.sides[side].party
    .map((p, i) => ({ p, i }))
    .filter(({ p, i }) => isAlive(p) && i !== state.sides[side].activeIndex)
    .map(({ i }) => ({ kind: "switch", partyIndex: i }) satisfies Action);

  // 全ての PP が尽きてもわるあがきがあるため、技の選択肢は必ず1つ残す
  return [...(moves.length > 0 ? moves : [{ kind: "move", moveIndex: 0 } as Action]), ...switches];
}

/** 行動を要求されている側。 */
export function requiredSides(state: BattleState): SideIndex[] {
  if (state.result !== null) return [];
  if (state.pendingSwitch.length > 0) return [...state.pendingSwitch];
  return [0, 1];
}

// ─────────────────────────────────────────────
// 内部処理
// ─────────────────────────────────────────────

function effectiveSpeed(p: BattlePokemon): number {
  const base = Math.floor(p.stats.spe * battleStageMultiplier(p.statStages.spe));
  return p.status === "paralysis" ? Math.floor(base * PARALYSIS_SPEED_MULTIPLIER) : base;
}

function speedOrder(state: BattleState, rng: Rng): [SideIndex, SideIndex] {
  const s0 = effectiveSpeed(activeOf(state, 0));
  const s1 = effectiveSpeed(activeOf(state, 1));
  if (s0 !== s1) return s0 > s1 ? [0, 1] : [1, 0];
  return rng.chance(0.5) ? [0, 1] : [1, 0];
}

function performSwitch(
  state: BattleState,
  side: SideIndex,
  partyIndex: number,
  events: BattleEvent[],
): void {
  const s = state.sides[side];
  const target = s.party[partyIndex];
  if (target === undefined) throw new RangeError(`invalid party index: ${partyIndex}`);
  if (!isAlive(target)) throw new Error("cannot switch to a fainted pokemon");
  if (partyIndex === s.activeIndex) throw new Error("cannot switch to the active pokemon");

  onSwitchOut(activeOf(state, side));
  s.activeIndex = partyIndex;
  events.push({ kind: "switchIn", side, partyIndex });
}

/** ダメージを与え、ひんしなら faint を発行する。 */
function dealDamage(
  state: BattleState,
  side: SideIndex,
  amount: number,
  events: BattleEvent[],
  make: (dealt: number, remaining: number) => BattleEvent,
): number {
  const target = activeOf(state, side);
  const before = target.currentHp;
  target.currentHp = Math.max(0, before - amount);
  const dealt = before - target.currentHp;
  events.push(make(dealt, target.currentHp));
  if (target.currentHp === 0) events.push({ kind: "faint", side });
  return dealt;
}

/**
 * 行動前の判定。行動できるなら true。
 * ねむり・こおり・まひ・ひるみ・混乱を処理する。
 */
function canAct(state: BattleState, side: SideIndex, rng: Rng, events: BattleEvent[]): boolean {
  const p = activeOf(state, side);

  if (p.volatile.flinched) {
    events.push({ kind: "blocked", side, reason: "flinch" });
    return false;
  }

  if (p.status === "sleep") {
    if (p.statusCounter <= 0) {
      p.status = null;
      events.push({ kind: "wokeUp", side });
    } else {
      p.statusCounter -= 1;
      events.push({ kind: "blocked", side, reason: "sleep" });
      return false;
    }
  }

  if (p.status === "freeze") {
    if (rng.chance(THAW_CHANCE)) {
      p.status = null;
      events.push({ kind: "thawed", side });
    } else {
      events.push({ kind: "blocked", side, reason: "freeze" });
      return false;
    }
  }

  if (p.status === "paralysis" && rng.chance(PARALYSIS_BLOCK_CHANCE)) {
    events.push({ kind: "blocked", side, reason: "paralysis" });
    return false;
  }

  if (p.volatile.confusionTurns > 0) {
    p.volatile.confusionTurns -= 1;
    if (p.volatile.confusionTurns === 0) {
      events.push({ kind: "snappedOut", side });
    } else if (rng.chance(CONFUSION_SELF_HIT_CHANCE)) {
      events.push({ kind: "blocked", side, reason: "confusion" });
      // 混乱の自傷: 威力40・タイプなしの物理を自分に
      const self = { ...STRUGGLE, power: CONFUSION_SELF_HIT_POWER };
      const { damage } = calcDamage({} as GameData, p, p, self, rng, {
        typeless: true,
        forceCritical: false,
      });
      dealDamage(state, side, damage, events, (amount, remainingHp) => ({
        kind: "confusionHit",
        side,
        amount,
        remainingHp,
      }));
      return false;
    }
  }

  return true;
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
  const self = activeOf(state, attacker);
  const foe = activeOf(state, defender);

  events.push(
    isStruggle
      ? { kind: "struggle", side: attacker }
      : { kind: "moveUsed", side: attacker, move: move.id },
  );

  if (!rollAccuracy(self, foe, move, rng)) {
    events.push({ kind: "missed", side: attacker });
    return;
  }

  const ctx: EffectContext = {
    data,
    state,
    attacker,
    defender,
    damageDealt: 0,
    rng,
    events,
    landed: false,
  };

  // ── 変化技 ──
  if (move.category === "status") {
    if (move.effect === undefined) {
      events.push({ kind: "failed", side: attacker });
      return;
    }
    applyEffect(move.effect, ctx);
    if (!ctx.landed) events.push({ kind: "failed", side: attacker });
    return;
  }

  // ── 攻撃技 ──
  const hits = resolveHitCount(move.effect, rng);
  let totalDealt = 0;
  let lastEffectiveness = 1;

  for (let i = 0; i < hits; i++) {
    if (activeOf(state, defender).currentHp <= 0) break;

    const result = calcDamage(data, self, activeOf(state, defender), move, rng, {
      typeless: isStruggle,
    });
    lastEffectiveness = result.effectiveness;

    if (result.effectiveness === 0) {
      events.push({ kind: "noEffect", side: defender });
      return;
    }

    totalDealt += dealDamage(state, defender, result.damage, events, (amount, remainingHp) => ({
      kind: "damage",
      side: defender,
      amount,
      remainingHp,
      effectiveness: result.effectiveness,
      critical: result.critical,
    }));
  }

  if (hits > 1) events.push({ kind: "hitCount", side: defender, hits });

  // ほのお技を受けるとこおりが解ける
  const target = activeOf(state, defender);
  if (target.status === "freeze" && move.type === "fire" && totalDealt > 0) {
    target.status = null;
    events.push({ kind: "thawed", side: defender });
  }

  if (isStruggle) {
    const recoil = Math.max(1, Math.floor(self.maxHp * STRUGGLE_RECOIL_RATIO));
    dealDamage(state, attacker, recoil, events, (amount, remainingHp) => ({
      kind: "recoil",
      side: attacker,
      amount,
      remainingHp,
    }));
    return;
  }

  if (move.effect !== undefined && lastEffectiveness !== 0) {
    ctx.damageDealt = totalDealt;
    applyEffect(move.effect, ctx);
  }
}

/** ターン終了時のスリップダメージ。 */
function endOfTurn(state: BattleState, rng: Rng, events: BattleEvent[]): void {
  for (const side of speedOrder(state, rng)) {
    const p = activeOf(state, side);
    if (p.currentHp <= 0) continue;

    const damage = residualDamage(p);
    if (damage > 0) {
      const status = p.status!;
      dealDamage(state, side, damage, events, (amount, remainingHp) => ({
        kind: "statusDamage",
        side,
        status,
        amount,
        remainingHp,
      }));
      if (p.status === "toxic") p.statusCounter += 1;
    }
  }

  // ひるみは1ターン限り
  for (const side of [0, 1] as const) {
    activeOf(state, side).volatile.flinched = false;
  }
}

/** ひんしを見て、交代要求または決着を確定する。 */
function updateBattleStatus(state: BattleState, events: BattleEvent[]): void {
  const lost: SideIndex[] = [];
  const needSwitch: SideIndex[] = [];

  for (const side of [0, 1] as const) {
    if (activeOf(state, side).currentHp > 0) continue;
    if (state.sides[side].party.some(isAlive)) needSwitch.push(side);
    else lost.push(side);
  }

  if (lost.length === 2) {
    state.result = { winner: null };
    events.push({ kind: "battleEnd", winner: null });
    return;
  }
  if (lost.length === 1) {
    const winner = other(lost[0]!);
    state.result = { winner };
    events.push({ kind: "battleEnd", winner });
    return;
  }
  state.pendingSwitch = needSwitch;
}

// ─────────────────────────────────────────────
// step
// ─────────────────────────────────────────────

export function step(
  data: GameData,
  state: BattleState,
  actions: [Action | null, Action | null],
): StepResult {
  if (state.result !== null) throw new Error("battle is already over");

  const draft: BattleState = structuredClone(state);
  const rng = createRng(draft.rng);
  const events: BattleEvent[] = [];

  // ── ひんし後の交代のみを処理する（ターンは進めない）──
  if (draft.pendingSwitch.length > 0) {
    for (const side of draft.pendingSwitch) {
      const action = actions[side];
      if (action?.kind !== "switch") {
        throw new Error(`side ${side} must switch after fainting`);
      }
      performSwitch(draft, side, action.partyIndex, events);
    }
    draft.pendingSwitch = [];
    draft.rng = rng.state();
    return { state: draft, events };
  }

  draft.turn += 1;
  if (draft.turn > MAX_TURNS) {
    throw new Error(`battle exceeded ${MAX_TURNS} turns without a result`);
  }
  events.push({ kind: "turnStart", turn: draft.turn });

  const resolved = ([0, 1] as const).map((side) => {
    const action = actions[side];
    if (action === null) throw new Error(`side ${side} must act`);
    if (action.kind === "item" || action.kind === "run") {
      throw new Error(`action "${action.kind}" is not implemented in v0.2`);
    }
    return action;
  }) as [Exclude<Action, { kind: "item" } | { kind: "run" }>, ...Exclude<Action, { kind: "item" } | { kind: "run" }>[]];

  // ── 1. 交代（技より常に先）──
  for (const side of speedOrder(draft, rng)) {
    const action = resolved[side]!;
    if (action.kind === "switch") performSwitch(draft, side, action.partyIndex, events);
  }

  // ── 2. 使用する技を確定（PP が全滅していればわるあがき）──
  const chosen = ([0, 1] as const).map((side) => {
    const action = resolved[side]!;
    if (action.kind !== "move") return null;

    const active = activeOf(draft, side);
    if (!active.moves.some((m) => m.pp > 0)) {
      return { move: STRUGGLE, isStruggle: true, slotIndex: -1 };
    }
    const slot = active.moves[action.moveIndex];
    if (slot === undefined) throw new RangeError(`invalid move index: ${action.moveIndex}`);
    if (slot.pp <= 0) throw new Error(`move "${slot.id}" has no PP left`);
    return { move: data.move(slot.id), isStruggle: false, slotIndex: action.moveIndex };
  });

  // ── 3. 技（優先度 → 素早さ → 乱数）──
  const order = ((): [SideIndex, SideIndex] => {
    const p0 = chosen[0]?.move.priority ?? -Infinity;
    const p1 = chosen[1]?.move.priority ?? -Infinity;
    if (p0 !== p1) return p0 > p1 ? [0, 1] : [1, 0];
    return speedOrder(draft, rng);
  })();

  for (const side of order) {
    if (draft.result !== null) break;
    const pick = chosen[side];
    if (pick === null || pick === undefined) continue;
    if (activeOf(draft, side).currentHp <= 0) continue;

    if (!canAct(draft, side, rng, events)) continue;

    if (!pick.isStruggle) {
      activeOf(draft, side).moves[pick.slotIndex]!.pp -= 1;
    }
    performMove(data, draft, side, pick.move, pick.isStruggle, rng, events);
    updateBattleStatus(draft, events);
    if (draft.result !== null) break;
  }

  // ── 4. ターン終了処理 ──
  if (draft.result === null) {
    endOfTurn(draft, rng, events);
    updateBattleStatus(draft, events);
  }

  draft.rng = rng.state();
  return { state: draft, events };
}

export { EMPTY_STAGES };
