/**
 * バトルエンジン。
 *
 * 「状態 + 入力 → 新しい状態 + イベント列」の純関数として表現する。
 * 呼び出し元の state は変更しない。core は時間の概念を持たない。
 * 設計: docs/design/battle-system.md §1〜§9
 */

import { attemptCapture, isBall, safariFleeChance, type CaptureContext } from "./capture.js";
import { calcDamage, rollAccuracy } from "./damage.js";
import {
  applyEffect,
  resolveHitCount,
  resolvePresent,
  type EffectContext,
  type HpMutator,
} from "./effects.js";
import type { GameData } from "./gamedata.js";
import {
  absorbOf,
  afterOwnMove,
  applyAbsorbGain,
  bansStatusMoves,
  blocksFlinch,
  enduresOf,
  extraPpCost,
  onCheckHeld,
  onContacted,
  onEndOfTurnHeld,
  onSwitchIn,
  onSwitchOutHeld,
  statMultiplier,
  trapsFoe,
} from "./held.js";
import { toBattlePokemon, type BattlePokemonSource } from "./normalize.js";
import { createRng, createRngState, type Rng } from "./rng.js";
import { battleStageMultiplier } from "./stages.js";
import { refused, useOnBattle } from "./use-item.js";
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
  JudgeCriterion,
  JudgeRule,
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
  options: {
    /** 野生戦なら逃走が選べる（v0.7）。省略時はトレーナー戦。 */
    isWild?: boolean;
    /**
     * サファリの規則（v1.1-h）。技も交代も使えず、
     * **エサ・イシ・ボール・逃げるだけ**になる。
     */
    safari?: boolean;
    /**
     * ターン制限（v0.11・バトルアリーナ）。
     * 省略すると「ひんしまで」―― これまでどおりの、決着するまで終わらないバトル。
     */
    limit?: { turns: number; judge: JudgeRule };
  } = {},
): BattleState {
  const build = (sources: readonly BattlePokemonSource[]): Side => {
    if (sources.length === 0) throw new Error("party must not be empty");
    return { party: sources.map((s) => toBattlePokemon(data, s)), activeIndex: 0 };
  };
  return {
    sides: [build(parties[0]), build(parties[1])],
    turn: 0,
    rng: createRngState(seed),
    isWild: options.isWild ?? false,
    // サファリの段階（v1.1-h）。**サファリでなければ null。**
    // 「段階を持っているか」がそのまま「サファリか」の判定になるので、
    // `isSafari` のような真偽値をもう1つ持たずに済む
    safari: options.safari === true ? { rocks: 0, baits: 0 } : null,
    runAttempts: 0,
    result: null,
    limit: options.limit ?? null,
    tally: [
      { damageDealt: 0, movesHit: 0 },
      { damageDealt: 0, movesHit: 0 },
    ],
    pendingSwitch: [],
  };
}

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);

export function activeOf(state: BattleState, side: SideIndex): BattlePokemon {
  return state.sides[side].party[state.sides[side].activeIndex]!;
}

const isAlive = (p: BattlePokemon) => p.currentHp > 0;

/**
 * その側が選べる行動。AI と UI はこれを使う。
 *
 * v0.5 で GameData を取るようになった。こだわり系の技固定・とつげきチョッキ・
 * じりょくの交代封じは「どの技が使えるか」の問題なので、選択肢の側で解く。
 * バトル本体で弾くと、UI が選べない行動を表示してしまう。
 */
export function legalActions(data: GameData, state: BattleState, side: SideIndex): Action[] {
  const switchable = (): Action[] =>
    state.sides[side].party
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => isAlive(p) && i !== state.sides[side].activeIndex)
      .map(({ i }) => ({ kind: "switch", partyIndex: i }) satisfies Action);

  // 交代要求中は交代しか選べない（ひんし後の交代は封じられない）
  if (state.pendingSwitch.includes(side)) return switchable();
  if (state.pendingSwitch.length > 0) return []; // 相手の交代待ち

  const active = activeOf(state, side);
  const foe = activeOf(state, other(side));

  const usable = usableMoveIndices(data, state, side).map(
    (i) => ({ kind: "move", moveIndex: i }) satisfies Action,
  );
  const switches = trapsFoe(data, foe, active) ? [] : switchable();
  // 逃走は野生戦のみ。トレーナー戦では選択肢に出さない（battle-system.md §2）
  const escape: Action[] = state.isWild && side === 0 ? [{ kind: "run" }] : [];
  // ボールは呼び出し側がバッグを見て足す。core は持ち物の在庫を知らない

  // **サファリでは技も交代も選べない**（v1.1-h）。
  // 「技の選択肢は必ず1つ残す」という下の約束も、ここでは成り立たない ――
  // わるあがき が出る余地そのものを消す
  if (state.safari !== null) {
    return [
      { kind: "safari", throw: "bait" },
      { kind: "safari", throw: "rock" },
      ...escape,
    ];
  }

  // 使える技が1つも無くてもわるあがきがあるため、技の選択肢は必ず1つ残す
  return [
    ...(usable.length > 0 ? usable : [{ kind: "move", moveIndex: 0 } as Action]),
    ...switches,
    ...escape,
  ];
}

/**
 * 実際に選べる技のスロット番号。
 * PP・こだわりの固定・とつげきチョッキの制限をすべて反映する。
 * 空なら「わるあがき」になる。
 */
export function usableMoveIndices(
  data: GameData,
  state: BattleState,
  side: SideIndex,
): number[] {
  const active = activeOf(state, side);
  const banStatus = bansStatusMoves(data, active);
  const locked = active.volatile.choiceLocked;
  const out: number[] = [];
  for (const [i, slot] of active.moves.entries()) {
    if (slot.pp <= 0) continue;
    if (locked !== null && slot.id !== locked) continue;
    if (banStatus && data.move(slot.id).category === "status") continue;
    out.push(i);
  }
  return out;
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

function effectiveSpeed(data: GameData, p: BattlePokemon): number {
  const base = Math.floor(
    p.stats.spe * battleStageMultiplier(p.statStages.spe) * statMultiplier(data, p, "spe"),
  );
  return p.status === "paralysis" ? Math.floor(base * PARALYSIS_SPEED_MULTIPLIER) : base;
}

function speedOrder(data: GameData, state: BattleState, rng: Rng): [SideIndex, SideIndex] {
  const s0 = effectiveSpeed(data, activeOf(state, 0));
  const s1 = effectiveSpeed(data, activeOf(state, 1));
  if (s0 !== s1) return s0 > s1 ? [0, 1] : [1, 0];
  return rng.chance(0.5) ? [0, 1] : [1, 0];
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

function restoreHp(
  state: BattleState,
  side: SideIndex,
  amount: number,
  events: BattleEvent[],
  make: (healed: number, remaining: number) => BattleEvent,
): number {
  const target = activeOf(state, side);
  const before = target.currentHp;
  target.currentHp = Math.min(target.maxHp, before + Math.max(0, amount));
  const healed = target.currentHp - before;
  events.push(make(healed, target.currentHp));
  return healed;
}

/**
 * HP を動かす手段を1組にまとめる。
 * effects.ts と held.ts はこれを受け取り、自前で currentHp を触らない。
 * faint イベントの発行箇所が1つに保たれる。
 */
type Hp = { hurt: HpMutator; heal: HpMutator };

const hpMutators = (state: BattleState, events: BattleEvent[]): Hp => ({
  hurt: (side, amount, make) => dealDamage(state, side, amount, events, make),
  heal: (side, amount, make) => restoreHp(state, side, amount, events, make),
});

/** 特性・持ち物のフックに渡す共通部分。 */
function heldBase(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  rng: Rng,
  events: BattleEvent[],
) {
  return { data, state, side, foeSide: other(side), rng, events, ...hpMutators(state, events) };
}

/** 場に出たときの特性（いかく・トレース等）。バトル開始時にも通る。 */
function fireEntry(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  rng: Rng,
  events: BattleEvent[],
): void {
  if (activeOf(state, side).currentHp <= 0) return;
  onSwitchIn(heldBase(data, state, side, rng, events));
}

/** HP・状態異常が動いたあとの発動確認（きのみ）。 */
function checkHeld(
  data: GameData,
  state: BattleState,
  rng: Rng,
  events: BattleEvent[],
): void {
  for (const side of [0, 1] as const) {
    if (activeOf(state, side).currentHp <= 0) continue;
    onCheckHeld(heldBase(data, state, side, rng, events));
  }
}

function performSwitch(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  partyIndex: number,
  rng: Rng,
  events: BattleEvent[],
): void {
  const s = state.sides[side];
  const target = s.party[partyIndex];
  if (target === undefined) throw new RangeError(`invalid party index: ${partyIndex}`);
  if (!isAlive(target)) throw new Error("cannot switch to a fainted pokemon");
  if (partyIndex === s.activeIndex) throw new Error("cannot switch to the active pokemon");

  // しぜんかいふくは「引っ込む個体」の特性なので、状態のリセットより先に見る
  if (activeOf(state, side).currentHp > 0) {
    onSwitchOutHeld(heldBase(data, state, side, rng, events));
  }
  onSwitchOut(activeOf(state, side));
  s.activeIndex = partyIndex;
  events.push({ kind: "switchIn", side, partyIndex });
  fireEntry(data, state, side, rng, events);
}

/**
 * 行動前の判定。行動できるなら true。
 * ねむり・こおり・まひ・ひるみ・混乱を処理する。
 */
function canAct(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  rng: Rng,
  events: BattleEvent[],
): boolean {
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
      // 混乱の自傷は威力40・タイプなしの物理を自分に。急所は無し。
      // 以前ここで {} as GameData という偽のデータを渡していた。
      // typeless の経路が data を読まないから動いていただけで、
      // calcDamage が将来データを参照した瞬間に壊れる。実物を渡す。
      const selfHit = { ...STRUGGLE, power: CONFUSION_SELF_HIT_POWER };
      const { damage } = calcDamage(data, p, p, selfHit, rng, {
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

  const hp = hpMutators(state, events);
  const ctx: EffectContext = {
    data,
    state,
    attacker,
    defender,
    damageDealt: 0,
    rng,
    events,
    landed: false,
    isSecondary: false,
    ...hp,
  };

  // ── 特性による無効化（ふゆう・ちょすい・もらいび等）──
  // 命中判定より先に見る。当たる当たらない以前に「効かない」ため。
  if (!isStruggle && move.category !== "status") {
    const absorbed = absorbOf(data, foe, move.type);
    if (absorbed !== null) {
      events.push({ kind: "noEffect", side: defender });
      applyAbsorbGain(heldBase(data, state, defender, rng, events), absorbed.ref, absorbed.gain);
      return;
    }
  }

  if (!rollAccuracy(data, self, foe, move, rng)) {
    events.push({ kind: "missed", side: attacker });
    return;
  }

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
  //
  // **プレゼント だけは、当たったあとに威力を決める**（v1.1-k）。
  // 2割は攻撃ですらなく相手の回復になるので、ダメージ計算に入る前に分ける ――
  // `damage.ts` の `powerOverride` は v0.4 から開いていた口で、これが最初の利用者。
  const present = resolvePresent(move.effect, rng);
  if (present?.kind === "heal") {
    const healed = activeOf(state, defender);
    if (healed.currentHp >= healed.maxHp) {
      events.push({ kind: "failed", side: attacker });
      return;
    }
    ctx.heal(defender, Math.max(1, Math.floor(healed.maxHp / 4)), (amount, remainingHp) => ({
      kind: "heal",
      side: defender,
      amount,
      remainingHp,
    }));
    return;
  }
  const power = present?.kind === "power" ? { powerOverride: present.power } : {};

  const hits = resolveHitCount(move.effect, rng);
  let totalDealt = 0;
  let lastEffectiveness = 1;

  for (let i = 0; i < hits; i++) {
    if (activeOf(state, defender).currentHp <= 0) break;

    const target = activeOf(state, defender);
    const result = calcDamage(data, self, target, move, rng, { typeless: isStruggle, ...power });
    lastEffectiveness = result.effectiveness;

    if (result.effectiveness === 0) {
      events.push({ kind: "noEffect", side: defender });
      return;
    }

    // きあいのタスキ・がんじょう: HP満タンからの一撃を1で耐える
    const endured = result.damage >= target.currentHp
      ? enduresOf(data, target, result.damage)
      : null;
    const amount = endured === null ? result.damage : target.currentHp - 1;

    totalDealt += dealDamage(state, defender, amount, events, (dealt, remainingHp) => ({
      kind: "damage",
      side: defender,
      amount: dealt,
      remainingHp,
      effectiveness: result.effectiveness,
      critical: result.critical,
    }));

    if (endured !== null) {
      events.push(
        endured.source === "ability"
          ? { kind: "ability", side: defender, ability: endured.id }
          : { kind: "item", side: defender, item: endured.id },
      );
      events.push({ kind: "endured", side: defender });
      if (endured.source === "item") {
        target.itemConsumed = true;
        events.push({ kind: "itemConsumed", side: defender, item: endured.id });
      }
    }
  }

  // 採点の集計（v0.11）。**当たった技と与えたダメージだけを数える。**
  // 数えるだけなので、ターン制限が無いバトルでも害は無い
  if (totalDealt > 0) {
    state.tally[attacker].damageDealt += totalDealt;
    state.tally[attacker].movesHit += 1;
  }

  if (hits > 1) events.push({ kind: "hitCount", side: defender, hits });

  // ほのお技を受けるとこおりが解ける
  const target = activeOf(state, defender);
  if (target.status === "freeze" && move.type === "fire" && totalDealt > 0) {
    target.status = null;
    events.push({ kind: "thawed", side: defender });
  }

  // ── 接触技を受けた側の反応（せいでんき・ゴツゴツメット等）──
  if (move.contact === true && totalDealt > 0 && activeOf(state, attacker).currentHp > 0) {
    onContacted(heldBase(data, state, defender, rng, events));
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
    ctx.isSecondary = true;
    applyEffect(move.effect, ctx);
  }

  // ── 技を撃ち終わったあと（いのちのたま・こだわりの固定・あくしゅう）──
  if (activeOf(state, attacker).currentHp > 0) {
    afterOwnMove(heldBase(data, state, attacker, rng, events), totalDealt, move);
  }
}

/** ターン終了時のスリップダメージと、持ち物・特性のターン終了処理。 */
function endOfTurn(
  data: GameData,
  state: BattleState,
  rng: Rng,
  events: BattleEvent[],
): void {
  for (const side of speedOrder(data, state, rng)) {
    const p = activeOf(state, side);
    if (p.currentHp <= 0) continue;

    // たべのこし等はスリップダメージより先（原作の順序）
    onEndOfTurnHeld(heldBase(data, state, side, rng, events));

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

  checkHeld(data, state, rng, events);

  // ひるみは1ターン限り
  for (const side of [0, 1] as const) {
    activeOf(state, side).volatile.flinched = false;
  }
}

/**
 * 逃走の成否（第3世代以降の式）。
 *
 *   odds = (自分の素早さ × 128 / 相手の素早さ + 30 × 試行回数) % 256
 *   0〜255 の乱数が odds 未満なら成功
 *
 * 素早さが上回っていれば必ず成功する。試すほど成功しやすくなる。
 */
/** ボールの条件付き補正が読む「今の状況」。地形と図鑑は呼び出し側が足す。 */
const captureContext = (state: BattleState): CaptureContext =>
  state.safari === null
    ? { turn: state.turn }
    : { turn: state.turn, safari: { ...state.safari } };

function rollEscape(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  rng: Rng,
): boolean {
  const own = effectiveSpeed(data, activeOf(state, side));
  const foe = effectiveSpeed(data, activeOf(state, other(side)));
  if (own > foe) return true;
  if (foe === 0) return true;
  const odds = (Math.floor((own * 128) / foe) + 30 * state.runAttempts) % 256;
  return rng.int(256) < odds;
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
    state.result = { winner: null, reason: "faint" };
    events.push({ kind: "battleEnd", winner: null });
    return;
  }
  if (lost.length === 1) {
    const winner = other(lost[0]!);
    state.result = { winner, reason: "faint" };
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
      performSwitch(data, draft, side, action.partyIndex, rng, events);
    }
    draft.pendingSwitch = [];
    draft.rng = rng.state();
    return { state: draft, events };
  }

  // ── バトル開始時の特性（いかく等）──
  // createBattle はイベント列を返さないため、最初の step で発火させる。
  if (draft.turn === 0) {
    for (const side of speedOrder(data, draft, rng)) {
      fireEntry(data, draft, side, rng, events);
    }
    checkHeld(data, draft, rng, events);
  }

  draft.turn += 1;
  if (draft.turn > MAX_TURNS) {
    throw new Error(`battle exceeded ${MAX_TURNS} turns without a result`);
  }
  events.push({ kind: "turnStart", turn: draft.turn });

  // ── 0. 道具（技より先。ボールで捕まえたらその場でバトルが終わる）──
  //
  // 失敗しても**そのターンは何もできない**（原作どおり。相手は動く）。
  // 「投げる」と「戦う」が同じ1ターンを取り合うから、削るか捕るかの選択になる。
  // 回復薬も同じ扱い ―― 1ターンを使うからこそ、使うかどうかが判断になる。
  for (const side of [0, 1] as const) {
    const action = actions[side];
    if (action?.kind !== "item") continue;
    if (side !== 0) throw new Error("道具を使うのはプレイヤー側だけ");

    if (!isBall(data, action.item)) {
      // 回復薬など。倒れている手持ちにも使えるので、場に出ている1体に限らない
      const mon = draft.sides[side].party[action.target ?? draft.sides[side].activeIndex];
      if (mon === undefined) throw new Error("道具の対象が手持ちに居ない");
      const target = action.target ?? draft.sides[side].activeIndex;
      const result = useOnBattle(data, action.item, mon);
      events.push({
        kind: "itemUsed",
        side,
        item: action.item,
        text: refused(result) ? result.reason : result.message,
        target,
        remainingHp: mon.currentHp,
        status: mon.status,
      });
      continue;
    }

    if (!draft.isWild) throw new Error("ボールは野生戦でしか投げられない");

    const target = activeOf(draft, other(side));
    const result = attemptCapture(data, target, data.ball(action.item), captureContext(draft), rng);
    events.push({
      kind: "ballThrown",
      item: action.item,
      shakes: result.shakes,
      caught: result.caught,
    });
    if (result.caught) {
      draft.result = { winner: side, reason: "caught" };
      draft.caughtWith = action.item;
      events.push({ kind: "battleEnd", winner: side });
      draft.rng = rng.state();
      return { state: draft, events };
    }
  }

  // ── 0.5 サファリのエサ・イシ（v1.1-h）──
  //
  // **捕まえやすさと逃げやすさが逆に動く。** イシは当てやすくするが逃げられやすく、
  // エサは居座らせるが捕まえにくい ―― 技が無いぶん、ここが唯一の駆け引きになる。
  for (const side of [0, 1] as const) {
    const action = actions[side];
    if (action?.kind !== "safari") continue;
    if (draft.safari === null) throw new Error("エサ・イシはサファリでしか投げられない");
    if (action.throw === "bait") draft.safari.baits += 1;
    else draft.safari.rocks += 1;
    events.push({ kind: "safariThrown", throw: action.throw });

    if (rng.chance(safariFleeChance(captureContext(draft)))) {
      draft.result = { winner: null, reason: "escaped" };
      events.push({ kind: "fled" });
      events.push({ kind: "battleEnd", winner: null });
      draft.rng = rng.state();
      return { state: draft, events };
    }
  }

  // ── 0. 逃走（技より先。成功すればその場でバトルが終わる）──
  for (const side of [0, 1] as const) {
    if (actions[side]?.kind !== "run") continue;
    if (!draft.isWild) throw new Error("逃走は野生戦でしか選べない");
    draft.runAttempts += 1;
    if (rollEscape(data, draft, side, rng)) {
      draft.result = { winner: null, reason: "escaped" };
      events.push({ kind: "escaped", side });
      events.push({ kind: "battleEnd", winner: null });
      draft.rng = rng.state();
      return { state: draft, events };
    }
    events.push({ kind: "runFailed", side });
  }

  const resolved = ([0, 1] as const).map((side) => {
    const action = actions[side];
    if (action === null) throw new Error(`side ${side} must act`);
    // ボールを投げた／逃走に失敗した側は、そのターン何もできない
    if (action.kind === "item" || action.kind === "run" || action.kind === "safari") {
      return { kind: "switch", partyIndex: -1 } as const;
    }
    return action;
  }) as [
    Exclude<Action, { kind: "item" } | { kind: "run" } | { kind: "safari" }>,
    ...Exclude<Action, { kind: "item" } | { kind: "run" } | { kind: "safari" }>[],
  ];

  // ── 1. 交代（技より常に先）──
  // partyIndex -1 は「逃走に失敗して何もできない」を表す番兵
  for (const side of speedOrder(data, draft, rng)) {
    const action = resolved[side]!;
    if (action.kind === "switch" && action.partyIndex >= 0) {
      performSwitch(data, draft, side, action.partyIndex, rng, events);
    }
  }

  // ── 2. 使用する技を確定（使える技が無ければわるあがき）──
  const chosen = ([0, 1] as const).map((side) => {
    const action = resolved[side]!;
    if (action.kind !== "move") return null;

    const active = activeOf(draft, side);
    if (usableMoveIndices(data, draft, side).length === 0) {
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
    return speedOrder(data, draft, rng);
  })();

  for (const side of order) {
    if (draft.result !== null) break;
    const pick = chosen[side];
    if (pick === null || pick === undefined) continue;
    if (activeOf(draft, side).currentHp <= 0) continue;

    if (!canAct(data, draft, side, rng, events)) {
      checkHeld(data, draft, rng, events);
      updateBattleStatus(draft, events);
      if (draft.result !== null) break;
      continue;
    }

    if (!pick.isStruggle) {
      // プレッシャーは相手の PP を余分に減らす
      const cost = 1 + extraPpCost(data, activeOf(draft, other(side)));
      const slot = activeOf(draft, side).moves[pick.slotIndex]!;
      slot.pp = Math.max(0, slot.pp - cost);
    }
    performMove(data, draft, side, pick.move, pick.isStruggle, rng, events);
    checkHeld(data, draft, rng, events);
    updateBattleStatus(draft, events);
    if (draft.result !== null) break;
  }

  // ── 4. ターン終了処理 ──
  if (draft.result === null) {
    endOfTurn(data, draft, rng, events);
    updateBattleStatus(draft, events);
  }

  // ── 5. ターン制限（v0.11・バトルアリーナ）──
  //
  // **ひんしより後に見る。** 制限ターンぴったりで倒れたなら、それは採点ではなく決着。
  if (draft.result === null && draft.limit !== null && draft.turn >= draft.limit.turns) {
    const decision = judge(draft, draft.limit.judge);
    draft.result = { winner: decision.winner, reason: "judged" };
    events.push({ kind: "judged", winner: decision.winner, by: decision.by });
    events.push({ kind: "battleEnd", winner: decision.winner });
  }

  draft.rng = rng.state();
  return { state: draft, events };
}

/**
 * 採点（v0.11）。観点を**並べた順に**比べ、差がついた時点で決める。
 *
 * 点数を合成しない ―― 合成すると「なぜ負けたか」が読めなくなる。
 * 全部同じなら引き分け（`winner: null`）。
 */
export function judge(
  state: BattleState,
  rule: JudgeRule,
): { winner: SideIndex | null; by: JudgeCriterion | null } {
  const remaining = (side: SideIndex): number => {
    const party = state.sides[side].party;
    const max = party.reduce((sum, p) => sum + p.maxHp, 0);
    return max === 0 ? 0 : party.reduce((sum, p) => sum + p.currentHp, 0) / max;
  };

  for (const criterion of rule.criteria) {
    const value = (side: SideIndex): number => {
      if (criterion === "hpRatio") return remaining(side);
      if (criterion === "damageDealt") return state.tally[side].damageDealt;
      return state.tally[side].movesHit;
    };
    const a = value(0);
    const b = value(1);
    if (a !== b) return { winner: a > b ? 0 : 1, by: criterion };
  }
  return { winner: null, by: null };
}

export { EMPTY_STAGES };
