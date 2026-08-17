/**
 * 特性・持ち物のレジストリ（v0.5）。
 *
 * 特性は約310種、持ち物は数百ある。1つずつ if を書く構造にすると、
 * 「コンテンツを1件足すコストをゼロに近づける」という本作の中心原則が崩れる。
 *
 * そこで技の効果（effects.ts）と同じ形にする。
 *   - 効果は HeldEffect という共通の語彙で表す（types.ts）
 *   - 効果の種類ごとに、必要なフックだけを実装したハンドラを1つ書く
 *   - 特性を1件足す = JSON を1行。既存の kind の組み合わせならコードは増えない
 *
 * 特性と持ち物でレジストリを分けないのは、両者の効果が実際に重なるため。
 * あついしぼう（特性）とタイプ半減の実（持ち物）を2回実装したくない。
 *
 * 設計: docs/design/battle-system.md §12 / docs/design/progression.md §6
 */

import type { GameData } from "./gamedata.js";
import type { Rng } from "./rng.js";
import { applyStageChange } from "./stages.js";
import { applyStatus } from "./status.js";
import type {
  AbsorbGain,
  BattleEvent,
  BattlePokemon,
  BattleState,
  HeldEffect,
  Move,
  SideIndex,
  StagedStat,
  StatId,
  StatusId,
  Type,
} from "./types.js";

/** 効果がどこから来たか。UI のメッセージと、消費できるかの判断に使う。 */
export type HeldSource = "ability" | "item";

export type HeldRef = {
  source: HeldSource;
  /** AbilityId または ItemId。 */
  id: string;
  effect: HeldEffect;
};

/** その個体が今持っている効果（特性と持ち物）。消費済みの持ち物は含まない。 */
export function heldEffectsOf(data: GameData, p: BattlePokemon): HeldRef[] {
  const out: HeldRef[] = [];
  if (p.ability !== null) {
    out.push({ source: "ability", id: p.ability, effect: data.ability(p.ability).effect });
  }
  if (p.item !== null && !p.itemConsumed) {
    const item = data.item(p.item);
    if (item.held !== undefined) out.push({ source: "item", id: p.item, effect: item.held });
  }
  return out;
}

// ─────────────────────────────────────────────
// フックの文脈
// ─────────────────────────────────────────────

/** 値を問い合わせるだけのフック。状態を変えない。 */
export type QueryCtx = {
  data: GameData;
  /** 効果の持ち主。 */
  self: BattlePokemon;
  /** 相手（存在しない場面もある）。 */
  foe?: BattlePokemon;
  move?: Move;
  effectiveness?: number;
  stat?: StatId | StagedStat;
  status?: StatusId;
  moveType?: Type;
  incoming?: number;
};

/**
 * 状態を変えるフック。
 *
 * HP の増減を held.ts が直接書き換えるとひんし判定が二重になるため、
 * battle.ts が hurt / heal を渡す。faint イベントの発行箇所は1つに保つ。
 */
export type TriggerCtx = {
  data: GameData;
  state: BattleState;
  /** 効果の持ち主の side。 */
  side: SideIndex;
  foeSide: SideIndex;
  rng: Rng;
  events: BattleEvent[];
  source: HeldSource;
  id: string;
  hurt(side: SideIndex, amount: number, make: (dealt: number, remaining: number) => BattleEvent): number;
  heal(side: SideIndex, amount: number, make: (healed: number, remaining: number) => BattleEvent): number;
  /** 持ち物を消費する（特性なら何もしない）。 */
  consume(): void;
  /** 「〇〇の 〈特性名〉!」を1回だけ出す。 */
  announce(): void;
};

type Handler<K extends HeldEffect["kind"]> = {
  /** 攻撃側として与えるダメージの倍率。 */
  attackMultiplier?: (e: E<K>, c: QueryCtx) => number;
  /** 防御側として受けるダメージの倍率。 */
  defendMultiplier?: (e: E<K>, c: QueryCtx) => number;
  /** 実数値の倍率。 */
  statMultiplier?: (e: E<K>, c: QueryCtx) => number;
  accuracyMultiplier?: (e: E<K>, c: QueryCtx) => number;
  critStage?: (e: E<K>) => number;
  preventCrit?: (e: E<K>) => boolean;
  preventStatus?: (e: E<K>, c: QueryCtx) => boolean;
  preventConfusion?: (e: E<K>) => boolean;
  preventFlinch?: (e: E<K>) => boolean;
  preventRecoil?: (e: E<K>) => boolean;
  preventSecondary?: (e: E<K>) => boolean;
  preventStatDrop?: (e: E<K>, c: QueryCtx) => boolean;
  /** やけどによる物理威力半減を無視するか。 */
  ignoreBurnPenalty?: (e: E<K>) => boolean;
  /** 相手が使う技の追加 PP 消費（プレッシャー）。 */
  extraPpCost?: (e: E<K>) => number;
  /** 相手を交代できなくするか（じりょく）。 */
  trapsFoe?: (e: E<K>, c: QueryCtx) => boolean;
  /** ねむりのターン数の倍率（はやおき）。 */
  sleepTurns?: (e: E<K>) => number;
  /** その技を無効化するか。無効化するなら得るものを返す。 */
  absorb?: (e: E<K>, c: QueryCtx) => AbsorbGain | null;
  /** 一撃で倒される攻撃を耐えるか。 */
  endures?: (e: E<K>, c: QueryCtx) => boolean;

  onSwitchIn?: (e: E<K>, c: TriggerCtx) => void;
  onSwitchOut?: (e: E<K>, c: TriggerCtx) => void;
  onEndOfTurn?: (e: E<K>, c: TriggerCtx) => void;
  /** 自分が接触技を受けた（相手は c.foeSide）。 */
  onContacted?: (e: E<K>, c: TriggerCtx) => void;
  /** 自分が状態異常にされた。 */
  onStatusReceived?: (e: E<K>, c: TriggerCtx & { status: StatusId }) => void;
  /** 自分の攻撃技が命中し終わった。 */
  afterOwnMove?: (e: E<K>, c: TriggerCtx & { dealt: number; move: Move }) => void;
  /** HP や状態異常が動いたあとの発動確認（きのみ）。 */
  onCheck?: (e: E<K>, c: TriggerCtx) => void;
};

type E<K extends HeldEffect["kind"]> = Extract<HeldEffect, { kind: K }>;
type Registry = { [K in HeldEffect["kind"]]: Handler<K> };

const PINCH_RATIO = 1 / 3;
const isPinch = (p: BattlePokemon) => p.currentHp <= Math.floor(p.maxHp * PINCH_RATIO);

/** 状態異常・混乱をまとめて解除する。解除するものが無ければ false。 */
function cure(p: BattlePokemon): boolean {
  if (p.status === null && p.volatile.confusionTurns === 0) return false;
  p.status = null;
  p.statusCounter = 0;
  p.volatile.confusionTurns = 0;
  return true;
}

const activeOf = (state: BattleState, side: SideIndex): BattlePokemon =>
  state.sides[side].party[state.sides[side].activeIndex]!;

/**
 * 効果の種類 → ハンドラ。
 *
 * ここに1件足すのは「新しい種類の効果」を作るときだけ。
 * 特性・持ち物そのものを足すときは触らない。
 */
export const heldHandlers: Registry = {
  pinchBoost: {
    attackMultiplier: (e, c) =>
      c.move?.type === e.moveType && isPinch(c.self) ? e.ratio : 1,
  },

  typeBoost: {
    attackMultiplier: (e, c) => (c.move?.type === e.moveType ? e.ratio : 1),
  },

  superEffectiveBoost: {
    attackMultiplier: (e, c) => ((c.effectiveness ?? 1) > 1 ? e.ratio : 1),
  },

  powerRecoil: {
    attackMultiplier: (e) => e.ratio,
    afterOwnMove: (e, c) => {
      if (c.dealt <= 0) return;
      const self = activeOf(c.state, c.side);
      const amount = Math.max(1, Math.floor(self.maxHp * e.recoil));
      c.hurt(c.side, amount, (dealt, remainingHp) => ({
        kind: "itemDamage",
        side: c.side,
        item: c.id,
        amount: dealt,
        remainingHp,
      }));
    },
  },

  typeResist: {
    defendMultiplier: (e, c) =>
      c.move !== undefined && e.moveTypes.includes(c.move.type) ? e.ratio : 1,
  },

  statMultiplier: {
    statMultiplier: (e, c) => (c.stat === e.stat ? e.ratio : 1),
  },

  choice: {
    statMultiplier: (e, c) => (c.stat === e.stat ? e.ratio : 1),
    afterOwnMove: (_e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.volatile.choiceLocked === null) {
        self.volatile.choiceLocked = c.move.id;
      }
    },
  },

  statusAtkBoost: {
    statMultiplier: (e, c) => (c.stat === "atk" && c.self.status !== null ? e.ratio : 1),
    ignoreBurnPenalty: () => true,
  },

  accuracyMultiplier: {
    accuracyMultiplier: (e) => e.ratio,
  },

  critStage: {
    critStage: (e) => e.stages,
  },

  noCrit: {
    preventCrit: () => true,
  },

  typeAbsorb: {
    absorb: (e, c) => (c.moveType === e.moveType ? e.gain : null),
  },

  statusImmunity: {
    preventStatus: (e, c) => c.status !== undefined && e.statuses.includes(c.status),
  },

  confusionImmunity: {
    preventConfusion: () => true,
  },

  noFlinch: {
    preventFlinch: () => true,
  },

  noRecoil: {
    preventRecoil: () => true,
  },

  noSecondary: {
    preventSecondary: () => true,
  },

  statDropImmunity: {
    preventStatDrop: (e, c) =>
      e.stats === "all" || (c.stat !== undefined && e.stats.includes(c.stat as StagedStat)),
  },

  switchInStatChange: {
    onSwitchIn: (e, c) => {
      const side = e.target === "self" ? c.side : c.foeSide;
      const target = activeOf(c.state, side);
      if (target.currentHp <= 0) return;
      if (e.stages < 0 && blocksStatDrop(c.data, target, e.stat)) {
        c.announce();
        c.events.push({ kind: "statChangeFailed", side, stat: e.stat });
        return;
      }
      const { applied, stage } = applyStageChange(target, e.stat, e.stages);
      if (applied === 0) return;
      c.announce();
      c.events.push({ kind: "statChange", side, stat: e.stat, delta: applied, stage });
    },
  },

  contactStatus: {
    onContacted: (e, c) => {
      if (!c.rng.chance(e.chance)) return;
      const attacker = activeOf(c.state, c.foeSide);
      if (attacker.currentHp <= 0) return;
      const status = e.statuses.length === 1 ? e.statuses[0]! : c.rng.pick(e.statuses);
      if (blocksStatus(c.data, attacker, status)) return;
      if (!applyStatus(attacker, status, c.rng)) return;
      c.announce();
      c.events.push({ kind: "statusApplied", side: c.foeSide, status });
      onStatusReceived(c.data, c.state, c.foeSide, c.side, status, c);
    },
  },

  contactDamage: {
    onContacted: (e, c) => {
      const attacker = activeOf(c.state, c.foeSide);
      if (attacker.currentHp <= 0) return;
      c.announce();
      const amount = Math.max(1, Math.floor(attacker.maxHp * e.ratio));
      c.hurt(c.foeSide, amount, (dealt, remainingHp) => ({
        kind: "itemDamage",
        side: c.foeSide,
        item: c.id,
        amount: dealt,
        remainingHp,
      }));
    },
  },

  addFlinch: {
    afterOwnMove: (e, c) => {
      if (c.dealt <= 0 || !c.rng.chance(e.chance)) return;
      const target = activeOf(c.state, c.foeSide);
      if (target.currentHp <= 0 || blocksFlinch(c.data, target)) return;
      c.announce();
      target.volatile.flinched = true;
    },
  },

  endure: {
    endures: (_e, c) =>
      c.self.currentHp === c.self.maxHp && (c.incoming ?? 0) >= c.self.currentHp,
  },

  endOfTurnHeal: {
    onEndOfTurn: (e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.currentHp >= self.maxHp) return;
      c.announce();
      c.heal(c.side, Math.max(1, Math.floor(self.maxHp * e.ratio)), (amount, remainingHp) => ({
        kind: "heal",
        side: c.side,
        amount,
        remainingHp,
      }));
    },
  },

  statusOnHolder: {
    onEndOfTurn: (e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.status !== null) return;
      if (blocksStatus(c.data, self, e.status)) return;
      if (!applyStatus(self, e.status, c.rng)) return;
      c.announce();
      c.events.push({ kind: "statusApplied", side: c.side, status: e.status });
    },
  },

  berryHeal: {
    onCheck: (e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.currentHp <= 0) return;
      if (self.currentHp > Math.floor(self.maxHp * e.threshold)) return;
      if (self.currentHp >= self.maxHp) return;
      c.announce();
      c.heal(c.side, Math.max(1, Math.floor(self.maxHp * e.ratio)), (amount, remainingHp) => ({
        kind: "heal",
        side: c.side,
        amount,
        remainingHp,
      }));
      c.consume();
    },
  },

  berryCure: {
    onCheck: (_e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.currentHp <= 0) return;
      if (!cure(self)) return;
      c.announce();
      c.events.push({ kind: "cured", side: c.side });
      c.consume();
    },
  },

  endOfTurnCure: {
    onEndOfTurn: (e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.status === null) return;
      if (!c.rng.chance(e.chance)) return;
      self.status = null;
      self.statusCounter = 0;
      c.announce();
      c.events.push({ kind: "cured", side: c.side });
    },
  },

  switchOutCure: {
    onSwitchOut: (_e, c) => {
      const self = activeOf(c.state, c.side);
      if (self.status === null) return;
      self.status = null;
      self.statusCounter = 0;
      c.announce();
      c.events.push({ kind: "cured", side: c.side });
    },
  },

  synchronize: {
    onStatusReceived: (_e, c) => {
      const foe = activeOf(c.state, c.foeSide);
      if (foe.currentHp <= 0) return;
      if (blocksStatus(c.data, foe, c.status)) return;
      if (!applyStatus(foe, c.status, c.rng)) return;
      c.announce();
      c.events.push({ kind: "statusApplied", side: c.foeSide, status: c.status });
    },
  },

  trace: {
    onSwitchIn: (_e, c) => {
      const foe = activeOf(c.state, c.foeSide);
      if (foe.ability === null) return;
      // 同じものをコピーし続けると発動が繰り返されるため、自分と同じなら何もしない
      const self = activeOf(c.state, c.side);
      if (foe.ability === self.ability) return;
      c.announce();
      self.ability = foe.ability;
      c.events.push({ kind: "abilityChanged", side: c.side, ability: foe.ability });
    },
  },

  pressure: {
    extraPpCost: () => 1,
  },

  trapType: {
    trapsFoe: (e, c) => c.foe !== undefined && c.foe.types.includes(e.trapped),
  },

  earlyBird: {
    sleepTurns: () => 0.5,
  },

  inert: {},
};

// ─────────────────────────────────────────────
// 問い合わせ（battle.ts / damage.ts から呼ぶ）
// ─────────────────────────────────────────────

function product(
  data: GameData,
  p: BattlePokemon,
  pick: (h: Handler<HeldEffect["kind"]>) => ((e: never, c: QueryCtx) => number) | undefined,
  ctx: QueryCtx,
): number {
  let mult = 1;
  for (const ref of heldEffectsOf(data, p)) {
    const fn = pick(heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>);
    if (fn !== undefined) mult *= fn(ref.effect as never, ctx);
  }
  return mult;
}

function any(
  data: GameData,
  p: BattlePokemon,
  pick: (h: Handler<HeldEffect["kind"]>) => ((e: never, c: QueryCtx) => boolean) | undefined,
  ctx: QueryCtx,
): boolean {
  for (const ref of heldEffectsOf(data, p)) {
    const fn = pick(heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>);
    if (fn !== undefined && fn(ref.effect as never, ctx)) return true;
  }
  return false;
}

/** 攻撃側の持ち物・特性によるダメージ倍率。 */
export function attackMultiplier(
  data: GameData,
  attacker: BattlePokemon,
  move: Move,
  effectiveness: number,
): number {
  const base = product(data, attacker, (h) => h.attackMultiplier, {
    data,
    self: attacker,
    move,
    effectiveness,
  });
  // もらいびで強化されたタイプ（volatile なのでレジストリの外で扱う）
  return attacker.volatile.boostedMoveType === move.type ? base * 1.5 : base;
}

/** 防御側の持ち物・特性によるダメージ倍率。 */
export function defendMultiplier(
  data: GameData,
  defender: BattlePokemon,
  move: Move,
  effectiveness: number,
): number {
  return product(data, defender, (h) => h.defendMultiplier, {
    data,
    self: defender,
    move,
    effectiveness,
  });
}

export function statMultiplier(data: GameData, p: BattlePokemon, stat: StatId): number {
  return product(data, p, (h) => h.statMultiplier, { data, self: p, stat });
}

export function accuracyMultiplier(data: GameData, p: BattlePokemon): number {
  return product(data, p, (h) => h.accuracyMultiplier, { data, self: p });
}

export function critStageBonus(data: GameData, p: BattlePokemon): number {
  let bonus = 0;
  for (const ref of heldEffectsOf(data, p)) {
    const h = heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>;
    if (h.critStage !== undefined) bonus += h.critStage(ref.effect as never);
  }
  return bonus;
}

export const blocksCrit = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.preventCrit, { data, self: p });

export const blocksStatus = (data: GameData, p: BattlePokemon, status: StatusId): boolean =>
  any(data, p, (h) => h.preventStatus, { data, self: p, status });

export const blocksConfusion = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.preventConfusion, { data, self: p });

export const blocksFlinch = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.preventFlinch, { data, self: p });

export const blocksRecoil = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.preventRecoil, { data, self: p });

export const blocksSecondary = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.preventSecondary, { data, self: p });

export const blocksStatDrop = (data: GameData, p: BattlePokemon, stat: StagedStat): boolean =>
  any(data, p, (h) => h.preventStatDrop, { data, self: p, stat });

export const ignoresBurnPenalty = (data: GameData, p: BattlePokemon): boolean =>
  any(data, p, (h) => h.ignoreBurnPenalty as never, { data, self: p });

/** 相手のプレッシャー等による追加 PP 消費。 */
export function extraPpCost(data: GameData, foe: BattlePokemon): number {
  let extra = 0;
  for (const ref of heldEffectsOf(data, foe)) {
    const h = heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>;
    if (h.extraPpCost !== undefined) extra += h.extraPpCost(ref.effect as never);
  }
  return extra;
}

/** self が foe を交代できなくしているか。 */
export const trapsFoe = (data: GameData, self: BattlePokemon, foe: BattlePokemon): boolean =>
  any(data, self, (h) => h.trapsFoe, { data, self, foe });

/** ねむりのターン数の倍率。 */
export function sleepTurnsMultiplier(data: GameData, p: BattlePokemon): number {
  return product(data, p, (h) => h.sleepTurns as never, { data, self: p });
}

/** 防御側がその技のタイプを無効化するなら、得るものとその出どころを返す。 */
export function absorbOf(
  data: GameData,
  defender: BattlePokemon,
  moveType: Type,
): { ref: HeldRef; gain: AbsorbGain } | null {
  for (const ref of heldEffectsOf(data, defender)) {
    const h = heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>;
    if (h.absorb === undefined) continue;
    const gain = h.absorb(ref.effect as never, { data, self: defender, moveType });
    if (gain !== null) return { ref, gain };
  }
  return null;
}

/** その一撃を1で耐えるなら、その出どころを返す。 */
export function enduresOf(
  data: GameData,
  defender: BattlePokemon,
  incoming: number,
): HeldRef | null {
  for (const ref of heldEffectsOf(data, defender)) {
    const h = heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>;
    if (h.endures === undefined) continue;
    if (h.endures(ref.effect as never, { data, self: defender, incoming })) return ref;
  }
  return null;
}

/** 状態異常にできない技はそもそも撃たれないので、こだわり等の技制限をここで判定する。 */
export function bansStatusMoves(data: GameData, p: BattlePokemon): boolean {
  for (const ref of heldEffectsOf(data, p)) {
    if (ref.effect.kind === "statMultiplier" && ref.effect.banStatusMoves === true) return true;
  }
  return false;
}

// ─────────────────────────────────────────────
// 発動（状態を変える）
// ─────────────────────────────────────────────

type TriggerBase = Omit<TriggerCtx, "source" | "id" | "consume" | "announce">;

/** 1つの効果に対する TriggerCtx を組み立てる。announce は1回だけ出す。 */
function contextFor(base: TriggerBase, ref: HeldRef): TriggerCtx {
  let announced = false;
  return {
    ...base,
    source: ref.source,
    id: ref.id,
    announce() {
      if (announced) return;
      announced = true;
      base.events.push(
        ref.source === "ability"
          ? { kind: "ability", side: base.side, ability: ref.id }
          : { kind: "item", side: base.side, item: ref.id },
      );
    },
    consume() {
      if (ref.source !== "item") return;
      const self = activeOf(base.state, base.side);
      self.itemConsumed = true;
      base.events.push({ kind: "itemConsumed", side: base.side, item: ref.id });
    },
  };
}

function fire(
  base: TriggerBase,
  pick: (h: Handler<HeldEffect["kind"]>) => ((e: never, c: never) => void) | undefined,
  extra: Record<string, unknown> = {},
): void {
  const self = activeOf(base.state, base.side);
  for (const ref of heldEffectsOf(base.data, self)) {
    const fn = pick(heldHandlers[ref.effect.kind] as Handler<HeldEffect["kind"]>);
    if (fn === undefined) continue;
    fn(ref.effect as never, { ...contextFor(base, ref), ...extra } as never);
  }
}

export const onSwitchIn = (base: TriggerBase): void => fire(base, (h) => h.onSwitchIn);
export const onSwitchOutHeld = (base: TriggerBase): void => fire(base, (h) => h.onSwitchOut);
export const onEndOfTurnHeld = (base: TriggerBase): void => fire(base, (h) => h.onEndOfTurn);
export const onContacted = (base: TriggerBase): void => fire(base, (h) => h.onContacted);
export const onCheckHeld = (base: TriggerBase): void => fire(base, (h) => h.onCheck);

export const afterOwnMove = (base: TriggerBase, dealt: number, move: Move): void =>
  fire(base, (h) => h.afterOwnMove, { dealt, move });

/**
 * 状態異常を受けたときのフック（シンクロ）。
 * 呼び出し側が多いので、必要な情報だけを取る薄い入口にしてある。
 */
export function onStatusReceived(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  foeSide: SideIndex,
  status: StatusId,
  base: Pick<TriggerCtx, "rng" | "events" | "hurt" | "heal">,
): void {
  fire(
    { data, state, side, foeSide, rng: base.rng, events: base.events, hurt: base.hurt, heal: base.heal },
    (h) => h.onStatusReceived,
    { status },
  );
}

/** typeAbsorb の「得るもの」を適用する。 */
export function applyAbsorbGain(base: TriggerBase, ref: HeldRef, gain: AbsorbGain): void {
  const ctx = contextFor(base, ref);
  ctx.announce();
  const self = activeOf(base.state, base.side);

  switch (gain.kind) {
    case "none":
      return;
    case "heal": {
      if (self.currentHp >= self.maxHp) return;
      ctx.heal(base.side, Math.max(1, Math.floor(self.maxHp * gain.ratio)), (amount, remainingHp) => ({
        kind: "heal",
        side: base.side,
        amount,
        remainingHp,
      }));
      return;
    }
    case "stat": {
      const { applied, stage } = applyStageChange(self, gain.stat, gain.stages);
      if (applied === 0) {
        base.events.push({ kind: "statChangeFailed", side: base.side, stat: gain.stat });
        return;
      }
      base.events.push({
        kind: "statChange",
        side: base.side,
        stat: gain.stat,
        delta: applied,
        stage,
      });
      return;
    }
    case "boostMoveType": {
      self.volatile.boostedMoveType = ref.effect.kind === "typeAbsorb" ? ref.effect.moveType : null;
      return;
    }
  }
}

/** 全 kind にハンドラが登録されていることを検証する（検証項目 #24 相当）。 */
export function assertAllHeldEffectsHandled(kinds: readonly HeldEffect["kind"][]): void {
  for (const kind of kinds) {
    if (heldHandlers[kind] === undefined) {
      throw new Error(`no handler registered for held effect: "${kind}"`);
    }
  }
}
