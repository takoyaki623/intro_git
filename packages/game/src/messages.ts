/**
 * BattleEvent → 画面に出す文言。
 * core は文言を一切持たない（テキストは全てこちら側の責務）。
 * 設計: docs/design/ui-flow.md §8
 */

import type { BattleEvent, BlockedReason } from "@pkmn/core";
import { gameData } from "@pkmn/data";
import { STAT_LABEL, STATUS_LABEL, type BattleView } from "./view.js";

/** 天気の文（v1.2-c）。**始まり・削り・終わりで別の言い方をする**（原作どおり）。 */
const WEATHER_LABEL: Record<string, string> = {
  sun: "ひざし",
  rain: "あめ",
  sandstorm: "すなあらし",
  hail: "あられ",
};
const WEATHER_START: Record<string, string> = {
  sun: "ひざしが つよくなった!",
  rain: "あめが ふりはじめた!",
  sandstorm: "すなあらしが ふきはじめた!",
  hail: "あられが ふりはじめた!",
};
const WEATHER_END: Record<string, string> = {
  sun: "ひざしが もとに もどった。",
  rain: "あめが あがった。",
  sandstorm: "すなあらしが おさまった。",
  hail: "あられが やんだ。",
};

/** 壁の名前（v1.2-c）。張る・防ぐ・切れる の3つの文がこれを使う。 */
/**
 * 溜めの文（v1.2-c）。**技ごとに違う**ので、技の ID で引く。
 * 表に無い技は「ちからを ためている!」に落ちる（新しい溜め技を足しても文は出る）。
 */
const CHARGING_TEXT: Record<string, string> = {
  fly: "そらたかく とびあがった!",
  dig: "ちちゅうに もぐった!",
  "solar-beam": "こうげきの じゅんびを ととのえた!",
};

const SCREEN_LABEL: Record<string, string> = {
  reflect: "リフレクター",
  lightScreen: "ひかりのかべ",
  safeguard: "しんぴのまもり",
};

/**
 * 行動できなかった理由の文。**`Record<BlockedReason, …>` で持つ**（v1.2-c）――
 * `Record<string, …>` だと理由を1つ足したときに黙って undefined を呼び、
 * 落ちるのが画面のほうになる。
 */
const BLOCK_TEXT: Record<BlockedReason, (name: string) => string> = {
  sleep: (n) => `${n} は ぐうぐう ねむっている`,
  freeze: (n) => `${n} は こおって しまって うごけない`,
  paralysis: (n) => `${n} は からだが しびれて うごけない`,
  confusion: (n) => `${n} は わけも わからず じぶんを こうげきした`,
  flinch: (n) => `${n} は ひるんで わざが だせない`,
  recharge: (n) => `${n} は こうげきの はんどうで うごけない!`,
  infatuation: (n) => `${n} は メロメロで わざが だせない!`,
};

/** 演出の基準時間（ミリ秒）。実際の待ち時間は速度設定で割られる。 */
export function baseDelayOf(event: BattleEvent): number {
  switch (event.kind) {
    case "turnStart":
      return 0;
    case "moveUsed":
    case "struggle":
    case "switchIn":
      return 700;
    case "damage":
    case "confusionHit":
      return 650;
    case "faint":
      return 900;
    case "judged":
      return 1100;
    case "battleEnd":
      return 600;
    case "hitCount":
      return 400;
    default:
      return 550;
  }
}

/** null を返したイベントはログに出さない。 */
export function messageOf(event: BattleEvent, view: BattleView): string | null {
  const name = (side: 0 | 1) => view[side].name;
  const label = (side: 0 | 1) => (side === 0 ? name(side) : `あいての ${name(side)}`);

  switch (event.kind) {
    case "turnStart":
      return null;
    case "switchIn":
      return event.side === 0 ? `ゆけっ! ${name(0)}!` : `あいては ${name(1)} を くりだした!`;
    case "moveUsed":
      return `${label(event.side)} の ${gameData.move(event.move).name}!`;
    case "struggle":
      return `${label(event.side)} の わるあがき!`;
    case "blocked":
      return BLOCK_TEXT[event.reason](label(event.side));
    case "wokeUp":
      return `${label(event.side)} は めを さました!`;
    case "thawed":
      return `${label(event.side)} の こおりが とけた!`;
    case "snappedOut":
      return `${label(event.side)} の こんらんが とけた!`;
    case "missed":
      return `しかし わざは はずれた!`;
    case "noEffect":
      return `${label(event.side)} には こうかが ないようだ...`;
    case "failed":
      return `しかし うまく きまらなかった!`;
    case "damage": {
      if (event.effectiveness > 1) return `こうかは ばつぐんだ!`;
      if (event.effectiveness < 1) return `こうかは いまひとつの ようだ...`;
      return null;
    }
    case "hitCount":
      return `${event.hits}かい あたった!`;
    case "confusionHit":
      return `${label(event.side)} は じぶんを こうげきした!`;
    case "recoil":
      return `${label(event.side)} は はんどうで ダメージを うけた!`;
    case "drain":
      return `${label(event.side)} は たいりょくを すいとった!`;
    case "heal":
      return `${label(event.side)} は たいりょくを かいふくした!`;
    case "statusApplied":
      return `${label(event.side)} は ${STATUS_LABEL[event.status]} じょうたいに なった!`;
    case "confused":
      return `${label(event.side)} は こんらんした!`;
    case "statusDamage":
      return `${label(event.side)} は ${STATUS_LABEL[event.status]} の ダメージを うけた!`;
    case "weatherStart":
      return WEATHER_START[event.weather] ?? null;
    case "weatherDamage":
      return `${label(event.side)} は ${WEATHER_LABEL[event.weather] ?? event.weather} の ダメージを うけた!`;
    case "weatherEnd":
      return WEATHER_END[event.weather] ?? null;
    case "screenStart":
      return `${label(event.side)} は ${SCREEN_LABEL[event.screen]} に つつまれた!`;
    case "screenBlocked":
      return `${label(event.side)} は ${SCREEN_LABEL[event.screen]} に まもられている!`;
    case "charging":
      return `${label(event.side)} は ${CHARGING_TEXT[event.move] ?? "ちからを ためている!"}`;
    case "taunted":
      return `${label(event.side)} は ちょうはつ に のった!`;
    case "tauntEnded":
      return `${label(event.side)} の ちょうはつ が とけた。`;
    case "tormented":
      return `${label(event.side)} は いちゃもんを つけられた!`;
    case "infatuatedWith":
      return `${label(event.side)} は メロメロに なった!`;
    case "protecting":
      return `${label(event.side)} は まもりの たいせいに はいった!`;
    case "protected":
      return `${label(event.side)} は こうげきを まもった!`;
    case "screenEnd":
      return `${label(event.side)} の ${SCREEN_LABEL[event.screen]} が きれた。`;
    case "statChange": {
      const stat = STAT_LABEL[event.stat] ?? event.stat;
      const n = Math.abs(event.delta);
      const dir = event.delta > 0 ? "あがった" : "さがった";
      const much = n >= 2 ? "ぐーんと " : "";
      return `${label(event.side)} の ${stat}が ${much}${dir}!`;
    }
    case "statChangeFailed": {
      const stat = STAT_LABEL[event.stat] ?? event.stat;
      return `${label(event.side)} の ${stat}は もう かわらない!`;
    }
    case "faint":
      return event.side === 0 ? `${name(0)} は たおれた!` : `あいての ${name(1)} は たおれた!`;
    case "judged": {
      // 何で差がついたかを必ず出す。**採点の理由が見えないと理不尽にしか見えない**
      const BY: Record<string, string> = {
        hpRatio: "のこり HP",
        damageDealt: "あたえた ダメージ",
        movesHit: "あてた わざの かず",
      };
      const why = event.by === null ? "すべて ごかく" : `${BY[event.by] ?? event.by} の さ`;
      if (event.winner === null) return `じかんぎれ! ${why} ―― はんていは ひきわけ!`;
      return event.winner === 0
        ? `じかんぎれ! ${why}で はんていがち!`
        : `じかんぎれ! ${why}で はんていまけ...`;
    }
    // ── へんしん（v1.1-i）──
    case "transformed":
      return `${event.side === 0 ? "" : "あいての "}ポケモンは ${gameData.species(event.into).name} に へんしん した!`;
    case "battleEnd":
      if (event.winner === null) return `ひきわけ!`;
      return event.winner === 0 ? `しょうぶに かった!` : `めのまえが まっくらに なった...`;


    // ── 特性・持ち物（v0.5）──
    case "ability":
      return `${label(event.side)} の ${gameData.ability(event.ability).name}!`;
    case "item":
      return `${label(event.side)} の ${gameData.item(event.item).name}!`;
    case "itemConsumed":
      return `${label(event.side)} の ${gameData.item(event.item).name} は なくなった!`;
    case "itemUsed":
      // 何が起きたかの文は core が組み立てている（回復量の計算がそこにあるため）
      return `${gameData.item(event.item).name} を つかった!\n${event.text}`;
    case "itemDamage":
      return `${label(event.side)} は ダメージを うけた!`;
    case "endured":
      return `${label(event.side)} は こうげきを もちこたえた!`;
    case "cured":
      return `${label(event.side)} の じょうたいが もとに もどった!`;
    case "abilityChanged":
      return `${label(event.side)} は ${gameData.ability(event.ability).name} に なった!`;

    // ── 逃走（v0.7）──
    case "runFailed":
      return `にげられない!`;
    case "escaped":
      return `うまく にげきれた!`;

    // ── サファリ（v1.1-h）──
    // **エサとイシは反対に効く。** どちらを投げたかが一行で分かるようにする
    case "safariThrown":
      return event.throw === "bait"
        ? `エサを なげた!
あいては むちゅうで たべている。`
        : `イシを なげた!
あいては おこっている!`;
    case "fled":
      return `あいては にげていった!`;

    // ── 捕獲（v0.8）──
    // 揺れる演出そのものは battle-screen が出す。ここは投げた瞬間の一行だけ
    case "ballThrown":
      return `${gameData.item(event.item).name} を なげた!`;
  }
}

/** 急所は damage とは別行で出す。 */
export function extraMessagesOf(event: BattleEvent): string[] {
  if (event.kind === "damage" && event.critical) return [`きゅうしょに あたった!`];
  return [];
}
