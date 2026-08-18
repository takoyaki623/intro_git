/**
 * BattleEvent → 画面に出す文言。
 * core は文言を一切持たない（テキストは全てこちら側の責務）。
 * 設計: docs/design/ui-flow.md §8
 */

import type { BattleEvent } from "@pkmn/core";
import { gameData } from "@pkmn/data";
import { STAT_LABEL, STATUS_LABEL, type BattleView } from "./view.js";

const BLOCK_TEXT: Record<string, (name: string) => string> = {
  sleep: (n) => `${n} は ぐうぐう ねむっている`,
  freeze: (n) => `${n} は こおって しまって うごけない`,
  paralysis: (n) => `${n} は からだが しびれて うごけない`,
  confusion: (n) => `${n} は わけも わからず じぶんを こうげきした`,
  flinch: (n) => `${n} は ひるんで わざが だせない`,
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
      return BLOCK_TEXT[event.reason]!(label(event.side));
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
