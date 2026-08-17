/**
 * 技の効果のレジストリ。
 *
 * 技を追加するたびにコードを書き換えないための仕組み。
 * 新しい技の追加 = JSON を1件足す（既存の kind の組み合わせなら）。
 * 新しい kind が要る技だけ、ここにハンドラを1つ足す。
 * 設計: docs/design/battle-system.md §11
 */

import type { GameData } from "./gamedata.js";
import {
  blocksConfusion,
  blocksFlinch,
  blocksRecoil,
  blocksSecondary,
  blocksStatDrop,
  blocksStatus,
  onStatusReceived,
  sleepTurnsMultiplier,
} from "./held.js";
import type { Rng } from "./rng.js";
import { applyStageChange } from "./stages.js";
import { applyConfusion, applyStatus } from "./status.js";
import type { BattleEvent, BattlePokemon, BattleState, MoveEffect, SideIndex } from "./types.js";

/** HP の増減は battle.ts が渡す。ひんし判定とイベント発行を1箇所に保つため。 */
export type HpMutator = (
  side: SideIndex,
  amount: number,
  make: (applied: number, remainingHp: number) => BattleEvent,
) => number;

export type EffectContext = {
  data: GameData;
  /** step() 内の作業用ドラフト。呼び出し元の state は変更されない。 */
  state: BattleState;
  attacker: SideIndex;
  defender: SideIndex;
  /** 与えたダメージ（変化技では 0）。 */
  damageDealt: number;
  rng: Rng;
  events: BattleEvent[];
  /** 効果が1つでも通ったか。変化技の「しかし うまく きまらなかった」判定に使う。 */
  landed: boolean;
  /**
   * 攻撃技の「追加効果」として適用しているか。
   * りんぷんは追加効果だけを無効にし、変化技そのものは防げない。
   */
  isSecondary: boolean;
  hurt: HpMutator;
  heal: HpMutator;
};

export type EffectHandler<K extends MoveEffect["kind"] = MoveEffect["kind"]> = (
  effect: Extract<MoveEffect, { kind: K }>,
  ctx: EffectContext,
) => void;

type Registry = { [K in MoveEffect["kind"]]: EffectHandler<K> };

const activeOf = (ctx: EffectContext, side: SideIndex): BattlePokemon =>
  ctx.state.sides[side].party[ctx.state.sides[side].activeIndex]!;

/** りんぷんが防ぐのは「攻撃技の追加効果」だけ。変化技は防げない。 */
const secondaryBlocked = (ctx: EffectContext): boolean =>
  ctx.isSecondary && blocksSecondary(ctx.data, activeOf(ctx, ctx.defender));

export const effectHandlers: Registry = {
  /** 与ダメージの一定割合を自分が受ける。 */
  recoil: (effect, ctx) => {
    if (ctx.damageDealt <= 0) return;
    const self = activeOf(ctx, ctx.attacker);
    if (blocksRecoil(ctx.data, self)) return; // いしあたま
    const amount = Math.max(1, Math.floor(ctx.damageDealt * effect.ratio));
    ctx.hurt(ctx.attacker, amount, (applied, remainingHp) => ({
      kind: "recoil",
      side: ctx.attacker,
      amount: applied,
      remainingHp,
    }));
    ctx.landed = true;
  },

  /** 与ダメージの一定割合を自分が回復する。 */
  drain: (effect, ctx) => {
    if (ctx.damageDealt <= 0) return;
    const self = activeOf(ctx, ctx.attacker);
    if (self.currentHp <= 0) return;
    const amount = Math.max(1, Math.floor(ctx.damageDealt * effect.ratio));
    ctx.heal(ctx.attacker, amount, (applied, remainingHp) => ({
      kind: "drain",
      side: ctx.attacker,
      amount: applied,
      remainingHp,
    }));
    ctx.landed = true;
  },

  /** 最大HPの一定割合を回復する（変化技）。満タンなら失敗。 */
  heal: (effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    if (self.currentHp >= self.maxHp) return;
    ctx.heal(ctx.attacker, Math.floor(self.maxHp * effect.ratio), (applied, remainingHp) => ({
      kind: "heal",
      side: ctx.attacker,
      amount: applied,
      remainingHp,
    }));
    ctx.landed = true;
  },

  /** 状態異常を付与する。 */
  status: (effect, ctx) => {
    if (!ctx.rng.chance(effect.chance)) return;
    if (secondaryBlocked(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.currentHp <= 0) return;
    if (blocksStatus(ctx.data, target, effect.status)) return;
    const turns = effect.status === "sleep" ? sleepTurnsMultiplier(ctx.data, target) : 1;
    if (applyStatus(target, effect.status, ctx.rng, turns)) {
      ctx.events.push({ kind: "statusApplied", side: ctx.defender, status: effect.status });
      onStatusReceived(ctx.data, ctx.state, ctx.defender, ctx.attacker, effect.status, ctx);
      ctx.landed = true;
    }
  },

  /** 混乱させる。状態異常とは別枠で重複する。 */
  confuse: (effect, ctx) => {
    if (!ctx.rng.chance(effect.chance)) return;
    if (secondaryBlocked(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.currentHp <= 0) return;
    if (blocksConfusion(ctx.data, target)) return;
    if (applyConfusion(target, ctx.rng)) {
      ctx.events.push({ kind: "confused", side: ctx.defender });
      ctx.landed = true;
    }
  },

  /** ひるませる。相手がまだ行動していない場合のみ効く（判定は battle 側）。 */
  flinch: (effect, ctx) => {
    if (!ctx.rng.chance(effect.chance)) return;
    if (secondaryBlocked(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.currentHp <= 0) return;
    if (blocksFlinch(ctx.data, target)) return;
    target.volatile.flinched = true;
    ctx.landed = true;
  },

  /** 能力ランクを変化させる。 */
  statChange: (effect, ctx) => {
    if (!ctx.rng.chance(effect.chance)) return;
    const side = effect.target === "self" ? ctx.attacker : ctx.defender;
    const target = activeOf(ctx, side);
    if (target.currentHp <= 0) return;

    // 相手の能力を下げる場合だけ、りんぷん・クリアボディ等が働く
    if (effect.target === "foe" && effect.stages < 0) {
      if (secondaryBlocked(ctx)) return;
      if (blocksStatDrop(ctx.data, target, effect.stat)) {
        ctx.events.push({ kind: "statChangeFailed", side, stat: effect.stat });
        return;
      }
    }

    const { applied, stage } = applyStageChange(target, effect.stat, effect.stages);
    if (applied === 0) {
      ctx.events.push({ kind: "statChangeFailed", side, stat: effect.stat });
      return;
    }
    ctx.events.push({ kind: "statChange", side, stat: effect.stat, delta: applied, stage });
    ctx.landed = true;
  },

  /**
   * 連続攻撃。実際の連続処理は battle 側（ダメージ計算を繰り返す必要があるため）。
   * ここでは何もしない。回数の抽選は resolveHitCount が行う。
   */
  multiHit: () => {
    // battle.ts の resolveHitCount で扱う
  },
};

export function applyEffect(effect: MoveEffect, ctx: EffectContext): void {
  const handler = effectHandlers[effect.kind] as EffectHandler;
  if (handler === undefined) {
    throw new Error(`no handler registered for move effect: "${effect.kind}"`);
  }
  handler(effect as never, ctx);
}

/** 連続攻撃の回数。min=max なら固定回数、それ以外は抽選。 */
export function resolveHitCount(effect: MoveEffect | undefined, rng: Rng): number {
  if (effect?.kind !== "multiHit") return 1;
  if (effect.min === effect.max) return effect.min;
  // 2〜5回の技は 2,3 が 3/8 ずつ、4,5 が 1/8 ずつ（原作準拠）
  if (effect.min === 2 && effect.max === 5) {
    const r = rng.int(8);
    return r < 3 ? 2 : r < 6 ? 3 : r < 7 ? 4 : 5;
  }
  return rng.range(effect.min, effect.max);
}

/** 全 kind にハンドラが登録されていることを検証する（検証項目 #21 相当）。 */
export function assertAllEffectsHandled(kinds: readonly MoveEffect["kind"][]): void {
  for (const kind of kinds) {
    if (effectHandlers[kind] === undefined) {
      throw new Error(`no handler registered for move effect: "${kind}"`);
    }
  }
}
