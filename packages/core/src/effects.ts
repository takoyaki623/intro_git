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
import { MAX_FRIENDSHIP } from "./pokemon.js";
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

/**
 * しんぴのまもり（v1.2-c）。状態異常と混乱を防ぐ。
 *
 * **防いだことをイベントで言う。** 黙って何も起きないと、
 * 「外れた」のか「守られた」のかがプレイヤーに区別できない。
 */
function safeguarded(ctx: EffectContext, side: SideIndex): boolean {
  if (ctx.state.sides[side].screens.safeguard === undefined) return false;
  ctx.events.push({ kind: "screenBlocked", side, screen: "safeguard" });
  return true;
}

/** 与えたダメージのうち `ratio` を吸う（すいとる・ゆめくい で共有・v1.2-d）。 */
function drainBy(ratio: number, ctx: EffectContext): void {
  if (ctx.damageDealt <= 0) return;
  const self = activeOf(ctx, ctx.attacker);
  if (self.currentHp <= 0) return;
  const amount = Math.max(1, Math.floor(ctx.damageDealt * ratio));
  ctx.heal(ctx.attacker, amount, (applied, remainingHp) => ({
    kind: "drain",
    side: ctx.attacker,
    amount: applied,
    remainingHp,
  }));
  ctx.landed = true;
}

/**
 * みがわり の後ろに居るか（v1.2-d）。
 *
 * **立っている間は、相手から掛かるものが全部止まる** ――
 * 状態異常も混乱もひるみも能力低下も、身代わりが受ける。
 * 「ダメージだけ肩代わりする」実装にすると、みがわり を立てた意味がほとんど無くなる。
 */
const behindSubstitute = (ctx: EffectContext): boolean =>
  activeOf(ctx, ctx.defender).volatile.substitute > 0;

/** りんぷんが防ぐのは「攻撃技の追加効果」だけ。変化技は防げない。 */
const secondaryBlocked = (ctx: EffectContext): boolean =>
  ctx.isSecondary && blocksSecondary(ctx.data, activeOf(ctx, ctx.defender));

/**
 * 威力を実行時に決める効果（v1.1-k で1つ・v1.2-c で2つめ）。
 *
 * これらの技は表の `power` を持たない ―― 数字を書くと
 * 「その数字なのに使われない」ことになる。
 *
 * **この集合が住むのは core。** 同じことを検証とテストの2か所に書いていて、
 * v1.2-c で片方だけ直した跡ができた（検証は通ってテストが落ちた）。
 * 決めるのは1か所にして、検証もテストもここを読む。
 */
const DECIDES_POWER_AT_RUNTIME: ReadonlySet<MoveEffect["kind"]> = new Set([
  "present",
  "variablePower",
  // v1.2-d。**威力ではなくダメージそのものを決める**ので、表の威力は空
  "fixedDamage",
  "counter",
]);

/** その技が威力を実行時に決めるか（表の `power` が空でよいか）。 */
export const decidesPowerAtRuntime = (effect: MoveEffect | undefined): boolean =>
  effect !== undefined && DECIDES_POWER_AT_RUNTIME.has(effect.kind);

/** みがわり に払う割合（最大HPの 1/4）。身代わりのHPも同じ値。 */
const SUBSTITUTE_COST_DENOMINATOR = 4;

/** ねむる で眠るターン数（原作どおり必ず2ターン）。 */
const REST_SLEEP_TURNS = 2;

export const effectHandlers: Registry = {
  /** はねる。**何も起きないことが効果**（書き忘れと区別するために要る）。 */
  nothing: () => {},

  /**
   * 天気を変える（v1.2-c）。
   *
   * **同じ天気なら失敗する**（原作どおり）。上書きで延長できると、
   * 1体が撃ち続けるだけで永久に降らせられる ―― 効かなかったことを
   * `landed` を立てないことで言う（「しかし うまく きまらなかった」になる）。
   *
   * 消えるのはターン終了時（`battle.ts`）。**減らす場所を効果側に書かない** ――
   * 書くと「撃った側のターンだけ減る」ことになる。
   */
  weather: (effect, ctx) => {
    if (ctx.state.weather?.kind === effect.weather) return;
    ctx.state.weather = { kind: effect.weather, turns: effect.turns };
    ctx.landed = true;
    ctx.events.push({ kind: "weatherStart", weather: effect.weather });
  },

  /**
   * 壁を張る（v1.2-c）。**張るのは「使った側」**で、相手ではない ――
   * 技の `target` が self なのはそのため。
   *
   * 天気と同じく、切れるのはターン終了時（`battle.ts`）。
   */
  screen: (effect, ctx) => {
    const side = ctx.state.sides[ctx.attacker];
    if (side.screens[effect.screen] !== undefined) return;
    side.screens[effect.screen] = effect.turns;
    ctx.landed = true;
    ctx.events.push({ kind: "screenStart", side: ctx.attacker, screen: effect.screen });
  },

  /**
   * テレポート（v1.1-i）。**野生戦から抜ける。**
   *
   * 決着を書き込むだけでよい ―― ターンの処理は `draft.result` が
   * 埋まった時点で止まるようになっている（`battle.ts` の技の段は毎回見ている）。
   * **自分で止め方を書かない**のが要点で、書くと止め方が2つになる。
   */
  fleeWild: (_effect, ctx) => {
    if (!ctx.state.isWild) return; // トレーナー戦では何も起きない（原作どおり）
    ctx.state.result = { winner: null, reason: "escaped" };
    ctx.landed = true;
    ctx.events.push({ kind: "escaped", side: ctx.attacker });
    ctx.events.push({ kind: "battleEnd", winner: null });
  },

  /**
   * へんしん（v1.1-i）。相手の姿・タイプ・能力・技をコピーする。
   *
   * **HP はコピーしない**（原作どおり）。技の PP は5 ―― 元の PP を持ってくると、
   * 相手の技を満タンで撃てる別物になる。
   * 2回目は失敗する（`transformedFrom` が埋まっている＝もう変身している）。
   */
  transform: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    const foe = activeOf(ctx, ctx.defender);
    if (self.volatile.transformedFrom !== null) return;
    self.volatile.transformedFrom = {
      species: self.species,
      name: self.name,
      types: self.types,
      stats: self.stats,
      moves: self.moves,
      ability: self.ability,
    };
    self.species = foe.species;
    self.name = foe.name;
    self.types = [...foe.types];
    // HP だけは自分のまま。ここを写すと、変身するたびに体力が入れ替わる
    self.stats = { ...foe.stats, hp: self.stats.hp };
    self.moves = foe.moves.map((m) => ({ id: m.id, pp: 5, maxPp: 5 }));
    self.ability = foe.ability;
    ctx.landed = true;
    ctx.events.push({ kind: "transformed", side: ctx.attacker, into: foe.species });
  },

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
  drain: (effect, ctx) => drainBy(effect.ratio, ctx),

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
    if (behindSubstitute(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.currentHp <= 0) return;
    if (blocksStatus(ctx.data, target, effect.status)) return;
    if (safeguarded(ctx, ctx.defender)) return;
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
    if (behindSubstitute(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.currentHp <= 0) return;
    if (blocksConfusion(ctx.data, target)) return;
    if (safeguarded(ctx, ctx.defender)) return;
    if (applyConfusion(target, ctx.rng)) {
      ctx.events.push({ kind: "confused", side: ctx.defender });
      ctx.landed = true;
    }
  },

  /** ひるませる。相手がまだ行動していない場合のみ効く（判定は battle 側）。 */
  flinch: (effect, ctx) => {
    if (!ctx.rng.chance(effect.chance)) return;
    if (secondaryBlocked(ctx)) return;
    if (behindSubstitute(ctx)) return;
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
    if (effect.target === "foe" && behindSubstitute(ctx)) return;

    // 相手の能力を下げる場合だけ、りんぷん・クリアボディ等が働く。
    // **抽選も、りんぷんの判定も1回だけ**（v1.2-c で複数の能力を動かせるようにした）――
    // 能力ごとに引き直すと、ビルドアップ で片方だけ上がる版ができてしまう
    if (effect.target === "foe" && effect.stages < 0 && secondaryBlocked(ctx)) return;

    for (const stat of effect.stats) {
      if (effect.target === "foe" && effect.stages < 0 && blocksStatDrop(ctx.data, target, stat)) {
        ctx.events.push({ kind: "statChangeFailed", side, stat });
        continue;
      }
      const { applied, stage } = applyStageChange(target, stat, effect.stages);
      if (applied === 0) {
        ctx.events.push({ kind: "statChangeFailed", side, stat });
        continue;
      }
      ctx.events.push({ kind: "statChange", side, stat, delta: applied, stage });
      ctx.landed = true;
    }
  },

  /**
   * 連続攻撃。実際の連続処理は battle 側（ダメージ計算を繰り返す必要があるため）。
   * ここでは何もしない。回数の抽選は resolveHitCount が行う。
   */
  multiHit: () => {
    // battle.ts の resolveHitCount で扱う
  },

  /**
   * プレゼント。抽選は `resolvePresent`、実際の分岐は battle 側（v1.1-k）。
   * **威力を差し替えるのも回復に化けるのも、ダメージ計算の前**でないと間に合わない。
   */
  present: () => {
    // battle.ts の resolvePresent で扱う
  },

  /**
   * 溜め技（v1.2-c）。ここでは何もしない。
   *
   * **溜めはダメージの前**に決まらなければならないので、
   * 追加効果の段（ここ）では間に合わない ―― `performMove` の頭で見る。
   */
  charge: () => {
    // battle.ts の performMove で扱う
  },

  /** 撃ったあとの休み。**これは追加効果の段でよい** ―― 効くのは次のターンなので。 */
  recharge: (_effect, ctx) => {
    activeOf(ctx, ctx.attacker).volatile.mustRecharge = true;
    ctx.landed = true;
  },

  /**
   * ちょうはつ（v1.2-c）。相手の変化技を封じる。
   *
   * **重ねがけできない** ―― 掛け直しで永久に封じられると、
   * 変化技を持つ相手が何もできないまま終わる。
   */
  taunt: (effect, ctx) => {
    if (behindSubstitute(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.volatile.tauntTurns > 0) return;
    target.volatile.tauntTurns = effect.turns;
    ctx.landed = true;
    ctx.events.push({ kind: "taunted", side: ctx.defender });
  },

  /** いちゃもん（v1.2-c）。同じ技を続けて出せなくする。切れるのは交代のときだけ。 */
  torment: (_effect, ctx) => {
    if (behindSubstitute(ctx)) return;
    const target = activeOf(ctx, ctx.defender);
    if (target.volatile.tormented) return;
    target.volatile.tormented = true;
    ctx.landed = true;
    ctx.events.push({ kind: "tormented", side: ctx.defender });
  },

  /**
   * メロメロ（v1.2-c）。**性別が違うときだけ効く。**
   *
   * どちらかが性別なしなら失敗する ―― 設計図から作られた相手は
   * 性別を持たないので、施設ではほぼ効かない（原作でも同じ扱いになる）。
   */
  attract: (_effect, ctx) => {
    if (behindSubstitute(ctx)) return;
    const self = activeOf(ctx, ctx.attacker);
    const target = activeOf(ctx, ctx.defender);
    if (self.gender === null || target.gender === null) return;
    if (self.gender === target.gender) return;
    if (target.volatile.infatuated !== null) return;
    target.volatile.infatuated = ctx.attacker;
    ctx.landed = true;
    ctx.events.push({ kind: "infatuatedWith", side: ctx.defender });
  },

  /**
   * まもる（v1.2-c）。**成功したかどうかがここで決まる。**
   *
   * 続けて使うたび成功率が半分になる。回数を数えるのは `battle.ts` 側
   * （ほかの技を出したら 0 に戻す）で、ここは抽選と結果だけを持つ。
   */
  /**
   * 威力が状況で決まる技（v1.2-c）。ここでは何もしない。
   *
   * **威力はダメージ計算の前**に要るので、追加効果の段では間に合わない ――
   * `resolveVariablePower` を `performMove` が読む（プレゼントと同じ形）。
   */
  variablePower: () => {
    // battle.ts の resolveVariablePower で扱う
  },

  /**
   * ねむる（v1.2-c）。全回復して2ターン眠る。
   *
   * **`applyStatus` を通さない** ―― あれは「効かない状態異常」を弾く道で、
   * ねむる は自分から眠るので、ほのおタイプでも ねむり でも掛かる…
   * ではなく、**すでに眠っているときだけ失敗する**。
   */
  rest: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    if (self.currentHp >= self.maxHp) return;
    if (self.status === "sleep") return;
    ctx.heal(ctx.attacker, self.maxHp, (applied, remainingHp) => ({
      kind: "heal",
      side: ctx.attacker,
      amount: applied,
      remainingHp,
    }));
    self.status = "sleep";
    self.statusCounter = REST_SLEEP_TURNS;
    ctx.landed = true;
    ctx.events.push({ kind: "statusApplied", side: ctx.attacker, status: "sleep" });
  },

  /**
   * どろぼう（v1.2-c）。**自分が何も持っていないときだけ**奪える。
   *
   * 奪った持ち物はバトルが終われば消える ―― `itemConsumed` と同じ扱いで、
   * **バトルの外の持ち物は書き換えない**（書き換えると、負けた側の
   * 手持ちから道具が永久に消える）。
   */
  steal: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    const target = activeOf(ctx, ctx.defender);
    if (self.item !== null || target.item === null) return;
    if (target.currentHp <= 0) return;
    self.item = target.item;
    target.item = null;
    ctx.landed = true;
    ctx.events.push({ kind: "itemStolen", side: ctx.attacker, item: self.item });
  },

  /**
   * スキルスワップ（v1.2-c）。特性を入れ替える。
   *
   * `innateAbility` は動かさない ―― 交代したら元に戻る（へんしん と同じ形）。
   */
  swapAbility: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    const target = activeOf(ctx, ctx.defender);
    if (self.ability === target.ability) return;
    [self.ability, target.ability] = [target.ability, self.ability];
    ctx.landed = true;
    ctx.events.push({ kind: "abilitySwapped", side: ctx.attacker });
  },

  /**
   * ほえる（v1.2-c）。ここでは何もしない。
   *
   * **交代させるのは battle.ts の仕事** ―― 入れ替えとひんし判定は
   * `performSwitch` が持っていて、効果の側から呼ぶと2本目の道ができる。
   */
  forceSwitch: () => {
    // battle.ts の performMove で扱う
  },

  /** よこどり（v1.2-c）。構えるだけ。横取りするのは `performMove`。 */
  snatch: (_effect, ctx) => {
    activeOf(ctx, ctx.attacker).volatile.snatching = true;
    ctx.landed = true;
    ctx.events.push({ kind: "snatching", side: ctx.attacker });
  },

  /** きあいパンチ（v1.2-c）。判定はダメージの前なので `performMove` が見る。 */
  focus: () => {
    // battle.ts の performMove で扱う
  },

  /**
   * レベルと同じ固定ダメージ（v1.2-d）。ここでは何もしない。
   * **威力ではなくダメージそのものを決める**ので、計算の外側で扱う。
   */
  fixedDamage: () => {
    // battle.ts の performMove で扱う
  },

  /**
   * ゆめくい（v1.2-d）。**吸う式は `drain` と同じ。**
   * 違うのは撃てる条件（相手が眠っているか）だけで、それは performMove が見る。
   */
  drainAsleep: (effect, ctx) => drainBy(effect.ratio, ctx),

  /** カウンター（v1.2-d）。返す量はダメージ計算を通さない。 */
  counter: () => {
    // battle.ts の performMove で扱う
  },

  /** ゆびをふる（v1.2-d）。撃ち直しは performMove の仕事。 */
  metronome: () => {
    // battle.ts の performMove で扱う
  },

  /** じばく・だいばくはつ（v1.2-d）。**当たったあとに自分が倒れる。** */
  selfDestruct: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    if (self.currentHp <= 0) return;
    ctx.hurt(ctx.attacker, self.currentHp, (amount, remainingHp) => ({
      kind: "recoil",
      side: ctx.attacker,
      amount,
      remainingHp,
    }));
    ctx.landed = true;
  },

  /**
   * ものまね（v1.2-d）。相手が直前に使った技を、この枠に上書きする。
   *
   * **バトルの中だけの書き換え。** `BattlePokemon.moves` は戦闘開始時に
   * 作った写しなので、外の個体は変わらない（へんしん と同じ扱い）。
   */
  mimic: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    const copied = activeOf(ctx, ctx.defender).volatile.lastMove;
    if (copied === null) return;
    if (self.moves.some((m) => m.id === copied)) return;
    const slot = self.moves.findIndex((m) => m.id === "mimic");
    if (slot < 0) return;
    const move = ctx.data.move(copied);
    self.moves[slot] = { id: copied, pp: move.pp, maxPp: move.pp };
    ctx.landed = true;
    ctx.events.push({ kind: "mimicked", side: ctx.attacker, move: copied });
  },

  /**
   * みがわり（v1.2-d）。最大HPの1/4を払って身代わりを立てる。
   *
   * **払えないときは失敗する**（原作どおり）―― 残りHPちょうどでは立てない。
   */
  substitute: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    if (self.volatile.substitute > 0) return;
    const cost = Math.floor(self.maxHp / SUBSTITUTE_COST_DENOMINATOR);
    if (cost <= 0 || self.currentHp <= cost) return;
    ctx.hurt(ctx.attacker, cost, (amount, remainingHp) => ({
      kind: "recoil",
      side: ctx.attacker,
      amount,
      remainingHp,
    }));
    self.volatile.substitute = cost;
    ctx.landed = true;
    ctx.events.push({ kind: "substituteUp", side: ctx.attacker });
  },

  protect: (_effect, ctx) => {
    const self = activeOf(ctx, ctx.attacker);
    if (!ctx.rng.chance(1 / 2 ** self.volatile.protectStreak)) return;
    self.volatile.protecting = true;
    ctx.landed = true;
    ctx.events.push({ kind: "protecting", side: ctx.attacker });
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

/**
 * プレゼントの抽選（v1.1-k）。**威力が実行時に決まる技の入口。**
 *
 * `damage.ts` には `powerOverride` という口が前から開いていて、
 * **使っている者が誰も居なかった**（v1.1-k で `grep` して0件）。その最初の通行人。
 *
 * 原作の配分: 40%で威力40・30%で80・10%で120・20%で相手を回復。
 */
/**
 * 状況で決まる威力（v1.2-c）。**乱数を使わない**ので rng を取らない。
 *
 * おんがえし・やつあたり は なつき度 255 で威力 102 になる（原作の式）。
 * からげんき は状態異常のとき2倍 ―― 元の威力を渡してもらって掛ける。
 */
export function resolveVariablePower(
  effect: MoveEffect | undefined,
  attacker: BattlePokemon,
): number | null {
  if (effect?.kind !== "variablePower") return null;
  if (effect.from === "statusDouble") {
    const base = effect.base ?? 0;
    return attacker.status === null ? base : base * 2;
  }
  const friendship =
    effect.from === "friendship" ? attacker.friendship : MAX_FRIENDSHIP - attacker.friendship;
  return Math.max(1, Math.floor((friendship * 2) / 5));
}

export function resolvePresent(
  effect: MoveEffect | undefined,
  rng: Rng,
): { kind: "power"; power: number } | { kind: "heal" } | null {
  if (effect?.kind !== "present") return null;
  const r = rng.int(10);
  if (r < 4) return { kind: "power", power: 40 };
  if (r < 7) return { kind: "power", power: 80 };
  if (r < 8) return { kind: "power", power: 120 };
  return { kind: "heal" };
}

/** 全 kind にハンドラが登録されていることを検証する（検証項目 #21 相当）。 */
export function assertAllEffectsHandled(kinds: readonly MoveEffect["kind"][]): void {
  for (const kind of kinds) {
    if (effectHandlers[kind] === undefined) {
      throw new Error(`no handler registered for move effect: "${kind}"`);
    }
  }
}
