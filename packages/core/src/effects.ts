/**
 * 技の効果のレジストリ。
 *
 * 技を追加するたびにコードを書き換えないための仕組み。
 * 新しい技の追加 = JSON を1件足す（既存の kind の組み合わせなら）。
 * 新しい kind が要る技だけ、ここにハンドラを1つ足す。
 * 設計: docs/design/battle-system.md §11
 */

import type { GameData } from "./gamedata.js";
import type { Rng } from "./rng.js";
import type { BattleEvent, BattleState, MoveEffect, SideIndex } from "./types.js";

export type EffectContext = {
  data: GameData;
  /** step() 内の作業用ドラフト。呼び出し元の state は変更されない。 */
  state: BattleState;
  attacker: SideIndex;
  defender: SideIndex;
  damageDealt: number;
  rng: Rng;
  events: BattleEvent[];
};

export type EffectHandler<K extends MoveEffect["kind"] = MoveEffect["kind"]> = (
  effect: Extract<MoveEffect, { kind: K }>,
  ctx: EffectContext,
) => void;

type Registry = { [K in MoveEffect["kind"]]: EffectHandler<K> };

const clampHp = (hp: number, max: number) => Math.max(0, Math.min(max, hp));

export const effectHandlers: Registry = {
  /** 与ダメージの一定割合を自分が受ける。 */
  recoil: (effect, ctx) => {
    if (ctx.damageDealt <= 0) return;
    const self = ctx.state.sides[ctx.attacker].active;
    const amount = Math.max(1, Math.floor(ctx.damageDealt * effect.ratio));
    const before = self.currentHp;
    self.currentHp = clampHp(before - amount, self.maxHp);
    ctx.events.push({
      kind: "recoil",
      side: ctx.attacker,
      amount: before - self.currentHp,
      remainingHp: self.currentHp,
    });
  },

  /** 与ダメージの一定割合を自分が回復する。 */
  drain: (effect, ctx) => {
    if (ctx.damageDealt <= 0) return;
    const self = ctx.state.sides[ctx.attacker].active;
    const amount = Math.max(1, Math.floor(ctx.damageDealt * effect.ratio));
    const before = self.currentHp;
    self.currentHp = clampHp(before + amount, self.maxHp);
    ctx.events.push({
      kind: "drain",
      side: ctx.attacker,
      amount: self.currentHp - before,
      remainingHp: self.currentHp,
    });
  },
};

export function applyEffect(effect: MoveEffect, ctx: EffectContext): void {
  const handler = effectHandlers[effect.kind] as EffectHandler;
  if (handler === undefined) {
    throw new Error(`no handler registered for move effect: "${effect.kind}"`);
  }
  handler(effect as never, ctx);
}

/** 全 kind にハンドラが登録されていることを検証する（検証項目 #21 相当）。 */
export function assertAllEffectsHandled(kinds: readonly MoveEffect["kind"][]): void {
  for (const kind of kinds) {
    if (effectHandlers[kind] === undefined) {
      throw new Error(`no handler registered for move effect: "${kind}"`);
    }
  }
}
