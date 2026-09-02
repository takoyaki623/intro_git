/**
 * バッグから道具を「つかう」（v0.9）。
 *
 * バトル中とマップ上で、**同じ1つの実装を使う。**
 * 分けて書くと、きずぐすりの回復量がいつか片方だけずれる。
 *
 * そのために、対象を `UseTarget` という最小の形に揃えてから渡す。
 * バトル中は `BattlePokemon`、マップ上は `PokemonInstance` ―― 型は違うが、
 * 道具が触るところだけに絞れば1つにできる。
 *
 * v1.1-b で わざマシンと進化の石が入り、絞りが「HP・状態異常・PP」から
 * 「＋種族・持ち物・技のID」に広がった。**広げたぶんは読むだけ**で、
 * 個体を作り替える操作（技の入れ替え・進化）は
 * **提案として返して UI に渡す**（`UseResult.then`）―― 選ぶのはプレイヤーなので、
 * ここで決めると原作の「やめる」が効かない道具ができる。
 * その代わり、そういう道具は**バトル中には使えない**（`REBUILDS_INSTANCE`）。
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
  MoveId,
  PokemonInstance,
  SpeciesId,
  StatusId,
  UseEffect,
  UseScope,
} from "./types.js";

/**
 * 道具が触れる範囲。これ以外は道具からは触れない。
 *
 * v1.1-b で `species` と `item`、技の `id` が入った。
 * **どれも読むためで、書き換えるのは `moves` だけ** ―― 種族を変えるのは進化で、
 * それは「提案」を返して UI がやる（`then`）。
 */
export type UseTarget = {
  species: SpeciesId;
  currentHp: number;
  maxHp: number;
  status: StatusId | null;
  /** 持たせている道具。交換進化の代替が見る（progression.md §11）。 */
  item: ItemId | null;
  moves: { id: MoveId; pp: number; maxPp: number }[];
};

/**
 * 道具が起こす「続き」（v1.1-b）。
 *
 * **選ぶのはプレイヤー**なので、道具は起こしたいことだけ返して UI に渡す。
 * レベルアップの `canLearn` / `canEvolve` と同じ形にしてあるので、
 * UI 側は既にある `offerMove` / `offerEvolution` をそのまま使える。
 */
export type UseFollowUp =
  | { kind: "learnMove"; move: MoveId }
  | { kind: "evolve"; to: SpeciesId };

export type UseResult = {
  target: UseTarget;
  /** 何が起きたか。UI がそのまま出す。**続きがある道具は空**（続きの側が喋る）。 */
  message: string;
  then?: UseFollowUp;
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

/**
 * ハンドラが使える手掛かり（v1.1-b）。
 *
 * v0.9 の道具は HP・状態異常・PP しか触らなかったので `data` が要らなかった。
 * わざマシンと進化の石は**種族の表を引く**ので要る ―― 引数を2つ足す代わりに
 * 1つにまとめて、増えたときにハンドラの数だけ書き換えずに済むようにする。
 */
type UseContext = {
  data: GameData;
  /** 今つかっている道具。`evolveByItem` が「自分が鍵になる枝」を探すのに使う。 */
  item: ItemId;
};

type Handler = (
  ctx: UseContext,
  effect: UseEffect,
  target: UseTarget,
  name: string,
) => UseOutcome;

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
export const useHandlers: { [K in UseEffect["kind"]]: Handler } = {
  heal: (ctx, effect, target, name) => {
    if (effect.kind !== "heal") return NEVER;
    return healBy(target, effect.amount, name);
  },

  healRatio: (ctx, effect, target, name) => {
    if (effect.kind !== "healRatio") return NEVER;
    return healBy(target, Math.max(1, Math.floor(target.maxHp * effect.ratio)), name);
  },

  cure: (ctx, effect, target, name) => {
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

  revive: (ctx, effect, target, name) => {
    if (effect.kind !== "revive") return NEVER;
    if (!fainted(target)) return { reason: `${name} は げんきだ。` };
    const hp = Math.max(1, Math.floor(target.maxHp * effect.ratio));
    return {
      target: { ...target, currentHp: hp, status: null },
      message: `${name} は げんきを とりもどした!`,
    };
  },

  pp: (ctx, effect, target, name) => {
    if (effect.kind !== "pp") return NEVER;
    const targets = effect.all ? target.moves.map((_, i) => i) : firstLackingPp(target);
    if (targets.length === 0) return { reason: `${name} の PP は へっていない。` };
    const moves = target.moves.map((m, i) =>
      targets.includes(i) ? { ...m, pp: Math.min(m.maxPp, m.pp + effect.amount) } : m,
    );
    return { target: { ...target, moves }, message: `${name} の PP が かいふくした!` };
  },

  multi: (ctx, effect, target, name) => {
    if (effect.kind !== "multi") return NEVER;
    // **1つでも効けば成功**。HP が満タンでも状態異常は治ってほしい
    let current = target;
    const messages: string[] = [];
    let lastRefusal = NEVER.reason;
    for (const each of effect.of) {
      const outcome = useHandlers[each.kind](ctx, each, current, name);
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

  /**
   * わざマシン（v1.1-b）。
   *
   * 断る理由を3つに分けてある ―― **「使えなかった」だけでは、
   * 覚えられないのか もう覚えているのかが分からない。**
   */
  teachMove: (ctx, effect, target, name) =>
    effect.kind === "teachMove" ? teachMove(ctx.data, effect.move, target, name, "machine") : NEVER,

  /**
   * 進化させる道具（v1.1-b）。
   *
   * **進化そのものはここでやらない。** 種族を差し替えるのは `evolve()` の仕事で、
   * 演出と中断はプレイヤーのものなので、`then` で UI に渡す。
   */
  evolveByItem: (ctx, effect, target, name) => {
    if (effect.kind !== "evolveByItem") return NEVER;
    const to = evolutionByItem(ctx, effect.via, target);
    if (to === null) return { reason: `${name} には こうかが なかった。` };
    return { target, message: "", then: { kind: "evolve", to } };
  },
};

/** 技は4つまで（原作どおり）。postbattle.ts と同じ上限。 */
const MAX_MOVES = 4;

/** 教わり方（v1.2-d）。**どちらの表を見るかが違うだけ。** */
export type TeachSource = "machine" | "tutor";

/**
 * 技を覚えさせる（わざマシン v1.1-b / 技教え人 v1.2-d）。
 *
 * **1つの関数にした。** 断る理由も入れ替えの渡し方も同じで、
 * 違うのは「どちらの互換表を見るか」だけ ―― 2つに書き分けると、
 * 片方だけ「すでに覚えている」を言い忘れる日が来る。
 *
 * 断る理由を3つに分けてある ―― **「使えなかった」だけでは、
 * 覚えられないのか もう覚えているのかが分からない。**
 */
export function teachMove(
  data: GameData,
  move: MoveId,
  target: UseTarget,
  name: string,
  from: TeachSource,
): UseOutcome {
  const learned = data.move(move);
  const species = data.species(target.species);
  const table = from === "machine" ? species.tmMoves : species.tutorMoves;
  if (!table.includes(move)) {
    return { reason: `${name} には ${learned.name} は おぼえられない。` };
  }
  if (target.moves.some((m) => m.id === move)) {
    return { reason: `${name} は すでに ${learned.name} を おぼえている。` };
  }
  // 空きがあればその場で覚える。埋まっていれば入れ替えを UI に渡す
  // （レベルアップの `learned` / `canLearn` と同じ分かれ方・postbattle.ts）
  if (target.moves.length >= MAX_MOVES) {
    return { target, message: "", then: { kind: "learnMove", move } };
  }
  return {
    target: { ...target, moves: [...target.moves, { id: move, pp: learned.pp, maxPp: learned.pp }] },
    message: `${name} は ${learned.name} を おぼえた!`,
  };
}

/** 個体を作り替える道具。バトル中は使えない（v1.1-b）。 */
export const REBUILDS_INSTANCE = new Set<UseEffect["kind"]>(["teachMove", "evolveByItem"]);

/**
 * この道具で進化する枝を探す。
 *
 * `item` … 進化の石。枝の `item` が今つかっている道具と一致するもの。
 * `trade` … 通信交換の代替（つながりのヒモ）。交換時に持たせる道具が要る枝は、
 *           **その道具を持たせた状態**でだけ成立する（progression.md §11 の統合）。
 */
function evolutionByItem(
  ctx: UseContext,
  via: "item" | "trade",
  target: UseTarget,
): SpeciesId | null {
  for (const evo of ctx.data.species(target.species).evolutions) {
    if (via === "item") {
      if (evo.kind === "useItem" && evo.item === ctx.item) return evo.to;
      continue;
    }
    if (evo.kind !== "trade") continue;
    if (evo.item === undefined || evo.item === target.item) return evo.to;
  }
  return null;
}

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
  return useHandlers[effect.kind]({ data, item }, effect, target, name);
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
): { instance: PokemonInstance; message: string; then?: UseFollowUp } | UseRefusal {
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
      // **技は本数が変わりうる**（わざマシンで空きに入る・v1.1-b）ので、
      // 元の配列に重ねるのではなく `target` の側を正とする
      moves: target.moves.map((m) => ({ id: m.id, pp: m.pp })),
    },
    message: outcome.message,
    ...(outcome.then === undefined ? {} : { then: outcome.then }),
  };
}

/**
 * 技教え人が1体に教える（v1.2-d）。
 *
 * `useOnInstance` と同じ形 ―― 変換して・教えて・戻すだけ。
 * **道具を経由しない**（教え技は道具ではない）ので入口だけ別にしてある。
 */
export function teachToInstance(
  data: GameData,
  move: MoveId,
  instance: PokemonInstance,
): { instance: PokemonInstance; message: string; then?: UseFollowUp } | UseRefusal {
  const name = instance.nickname ?? data.species(instance.species).name;
  const outcome = teachMove(data, move, instanceTarget(data, instance), name, "tutor");
  if (refused(outcome)) return outcome;
  return {
    instance: {
      ...instance,
      moves: outcome.target.moves.map((m) => ({ id: m.id, pp: m.pp })),
    },
    message: outcome.message,
    ...(outcome.then === undefined ? {} : { then: outcome.then }),
  };
}

const instanceTarget = (data: GameData, instance: PokemonInstance): UseTarget => ({
  species: instance.species,
  currentHp: instance.currentHp,
  maxHp: maxHpOf(data, instance),
  status: instance.status,
  item: instance.item ?? null,
  moves: instance.moves.map((m) => ({ id: m.id, pp: m.pp, maxPp: data.move(m.id).pp })),
});

/** バトル中の1体に使う。`BattlePokemon` は書き換えて使う（battle.ts の流儀）。 */
export function useOnBattle(
  data: GameData,
  item: ItemId,
  mon: BattlePokemon,
): { message: string } | UseRefusal {
  // **戦っている最中の1体を別物にする道具は使えない**（v1.1-b）。
  // `BattlePokemon` は種族と技を戦闘開始時に固めているので、
  // 書き換えても画面と噛み合わない。データ側でも `scope: field` に締めてあるが、
  // **書き忘れを実装が黙って通さない**ようにここでも断る（検証 #94 が両方を見る）
  const effect = data.item(item).use;
  if (effect !== undefined && REBUILDS_INSTANCE.has(effect.kind)) {
    return { reason: "たたかっている さいちゅうには つかえない。" };
  }

  const outcome = useItem(
    data,
    item,
    {
      species: mon.species,
      currentHp: mon.currentHp,
      maxHp: mon.maxHp,
      status: mon.status,
      item: mon.item ?? null,
      moves: mon.moves.map((m) => ({ id: m.id, pp: m.pp, maxPp: m.maxPp })),
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
