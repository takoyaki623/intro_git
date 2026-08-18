/**
 * バッグから道具を「つかう」（v0.9）。
 *
 * バトル中とマップ上で、**同じ1つの実装を使う。**
 * 分けて書くと、きずぐすりの回復量がいつか片方だけずれる。
 *
 * そのために、対象を `UseTarget` という最小の形に揃えてから渡す。
 * バトル中は `BattlePokemon`、マップ上は `PokemonInstance` ―― 型は違うが、
 * 道具が触るのは「HP・状態異常・PP」の3つだけなので、この3つに絞れば1つにできる。
 *
 * 技効果・持ち物効果・イベントコマンドと同じレジストリ。
 * **道具を1種足すのはデータを1行足すこと**（設計: docs/design/economy.md §7）
 */

import type { GameData } from "./gamedata.js";
import { maxHpOf } from "./pokemon.js";
import type {
  BattlePokemon,
  Item,
  ItemId,
  PokemonInstance,
  StatusId,
  UseEffect,
  UseScope,
} from "./types.js";

/** 道具が触れる範囲。これ以外は道具からは触れない。 */
export type UseTarget = {
  currentHp: number;
  maxHp: number;
  status: StatusId | null;
  moves: { pp: number; maxPp: number }[];
};

export type UseResult = {
  target: UseTarget;
  /** 何が起きたか。UI がそのまま出す。 */
  message: string;
};

/** 使えない理由。`null` を返すのではなく理由を返す（UI が説明できる）。 */
export type UseRefusal = { reason: string };

export type UseOutcome = UseResult | UseRefusal;

/**
 * 使えなかったか。
 *
 * 「成功した中身」は場面ごとに違う（マップ上は新しい個体、バトル中は文だけ）ので、
 * 成功側を型引数にしてある ―― **断られた形は1つだけ**、というのがここの主張。
 */
export function refused<T extends object>(outcome: T | UseRefusal): outcome is UseRefusal {
  return "reason" in outcome;
}

type Handler = (effect: UseEffect, target: UseTarget, name: string) => UseOutcome;

/**
 * 各ハンドラの先頭にある `kind` の確認が外れたときの返り値。
 * レジストリの引き方が正しい限り到達しない（イベントコマンドと同じ書き方）。
 */
const NEVER: UseRefusal = { reason: "この どうぐは つかえない。" };

const fainted = (t: UseTarget) => t.currentHp <= 0;

/**
 * 効果の種類ごとの処理。
 *
 * **ひんしを気にするのは `revive` だけ**という規則をここで1回だけ書く。
 * 各ハンドラに散らすと、新しい道具を足すたびに書き忘れる。
 */
const handlers: { [K in UseEffect["kind"]]: Handler } = {
  heal: (effect, target, name) => {
    if (effect.kind !== "heal") return NEVER;
    return healBy(target, effect.amount, name);
  },

  healRatio: (effect, target, name) => {
    if (effect.kind !== "healRatio") return NEVER;
    return healBy(target, Math.max(1, Math.floor(target.maxHp * effect.ratio)), name);
  },

  cure: (effect, target, name) => {
    if (effect.kind !== "cure") return NEVER;
    if (target.status === null) return { reason: `${name} には こうかが なかった。` };
    // 空配列は「全ての状態異常」。列挙を全部書かせない
    if (effect.status.length > 0 && !effect.status.includes(target.status)) {
      return { reason: `${name} には こうかが なかった。` };
    }
    return {
      target: { ...target, status: null },
      message: `${name} の じょうたい いじょうが なおった!`,
    };
  },

  revive: (effect, target, name) => {
    if (effect.kind !== "revive") return NEVER;
    if (!fainted(target)) return { reason: `${name} は げんきだ。` };
    const hp = Math.max(1, Math.floor(target.maxHp * effect.ratio));
    return {
      target: { ...target, currentHp: hp, status: null },
      message: `${name} は げんきを とりもどした!`,
    };
  },

  pp: (effect, target, name) => {
    if (effect.kind !== "pp") return NEVER;
    const targets = effect.all ? target.moves.map((_, i) => i) : firstLackingPp(target);
    if (targets.length === 0) return { reason: `${name} の PP は へっていない。` };
    const moves = target.moves.map((m, i) =>
      targets.includes(i) ? { ...m, pp: Math.min(m.maxPp, m.pp + effect.amount) } : m,
    );
    return { target: { ...target, moves }, message: `${name} の PP が かいふくした!` };
  },

  multi: (effect, target, name) => {
    if (effect.kind !== "multi") return NEVER;
    // **1つでも効けば成功**。HP が満タンでも状態異常は治ってほしい
    let current = target;
    const messages: string[] = [];
    let lastRefusal = NEVER.reason;
    for (const each of effect.of) {
      const outcome = handlers[each.kind](each, current, name);
      if (refused(outcome)) {
        lastRefusal = outcome.reason;
        continue;
      }
      current = outcome.target;
      messages.push(outcome.message);
    }
    if (messages.length === 0) return { reason: lastRefusal };
    return { target: current, message: messages.join("\n") };
  },
};

function healBy(target: UseTarget, amount: number, name: string): UseOutcome {
  // ひんしには回復薬が効かない（原作どおり。ふっかつが別に要る理由）
  if (fainted(target)) return { reason: `${name} は ひんしだ。` };
  if (target.currentHp >= target.maxHp) return { reason: `${name} の HP は まんたんだ。` };
  const healed = Math.min(target.maxHp, target.currentHp + amount);
  return {
    target: { ...target, currentHp: healed },
    message: `${name} の HP が ${healed - target.currentHp} かいふくした!`,
  };
}

const firstLackingPp = (target: UseTarget): number[] => {
  const i = target.moves.findIndex((m) => m.pp < m.maxPp);
  return i < 0 ? [] : [i];
};

/** 使える道具か（バッグに「つかう」ボタンを出すか）。 */
export function isUsable(item: Item, where: "battle" | "field"): boolean {
  if (item.use === undefined) return false;
  const scope: UseScope = item.useScope ?? "both";
  return scope === "both" || scope === where;
}

/**
 * 1回使う。
 *
 * **使えなかったときに道具を減らさない**のは呼び出し側の責任だが、
 * 判断できるように理由を返す。
 */
export function useItem(
  data: GameData,
  item: ItemId,
  target: UseTarget,
  name: string,
): UseOutcome {
  const effect = data.item(item).use;
  if (effect === undefined) return { reason: "この どうぐは つかえない。" };
  return handlers[effect.kind](effect, target, name);
}

// ─────────────────────────────────────────────
// 2つの姿への橋渡し
// ─────────────────────────────────────────────

/**
 * マップ上の1体に使う。
 *
 * 変換して・使って・戻すだけ。**回復量の計算はここに1行も無い。**
 * バトル側（`battle.ts`）も同じ `useItem` を呼ぶので、値がずれる余地が無い。
 */
export function useOnInstance(
  data: GameData,
  item: ItemId,
  instance: PokemonInstance,
): { instance: PokemonInstance; message: string } | UseRefusal {
  const name = instance.nickname ?? data.species(instance.species).name;
  const outcome = useItem(data, item, instanceTarget(data, instance), name);
  if (refused(outcome)) return outcome;
  const { target } = outcome;
  return {
    instance: {
      ...instance,
      currentHp: target.currentHp,
      status: target.status,
      statusCounter: target.status === null ? 0 : instance.statusCounter,
      moves: instance.moves.map((m, i) => ({ ...m, pp: target.moves[i]?.pp ?? m.pp })),
    },
    message: outcome.message,
  };
}

const instanceTarget = (data: GameData, instance: PokemonInstance): UseTarget => ({
  currentHp: instance.currentHp,
  maxHp: maxHpOf(data, instance),
  status: instance.status,
  moves: instance.moves.map((m) => ({ pp: m.pp, maxPp: data.move(m.id).pp })),
});

/** バトル中の1体に使う。`BattlePokemon` は書き換えて使う（battle.ts の流儀）。 */
export function useOnBattle(
  data: GameData,
  item: ItemId,
  mon: BattlePokemon,
): { message: string } | UseRefusal {
  const outcome = useItem(
    data,
    item,
    {
      currentHp: mon.currentHp,
      maxHp: mon.maxHp,
      status: mon.status,
      moves: mon.moves.map((m) => ({ pp: m.pp, maxPp: m.maxPp })),
    },
    mon.name,
  );
  if (refused(outcome)) return outcome;

  mon.currentHp = outcome.target.currentHp;
  if (outcome.target.status === null && mon.status !== null) {
    mon.status = null;
    mon.statusCounter = 0;
  }
  for (const [i, move] of mon.moves.entries()) move.pp = outcome.target.moves[i]?.pp ?? move.pp;
  return { message: outcome.message };
}
