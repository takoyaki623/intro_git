/**
 * PWT型トーナメント（v0.6）。
 *
 * 施設が「どう戦うか」の遊びなら、トーナメントは **「誰と戦うか」が主役**。
 * 有限だが密度が高い ―― カップ1回は3〜4戦で終わる。
 *
 * ここにカップごとの分岐は書かない。カップ = ルールセット + 出場者プール + 報酬。
 * 出場者プールを差し替えるだけでカップが増える、が設計の要点。
 *
 * 設計: docs/design/endgame.md §7・§11
 */

import type { GameData } from "../gamedata.js";
import type { PartySpec } from "../normalize.js";
import { createRng, createRngState } from "../rng.js";
import type { CupId, NamedId, RngState } from "../types.js";
import { partyFor, TIERS, type NamedCharacter, type TierId } from "./named.js";
import { syncedLevel, type Grade, type Ruleset } from "./ruleset.js";

export type Tournament = {
  id: CupId;
  name: string;
  description: string;
  ruleset: Ruleset;
  /** 出場者。殿堂入り済み地方のネームドだけで構成する（ネタバレを避ける）。 */
  entrantPool: NamedId[];
  /** 1回の勝ち抜き数。 */
  rounds: number;
  /**
   * 解放されるティアの順。原作で優勝 → 本気が解放、の鎖。
   * 同じカップが3回遊べる ―― 3ティアがそのまま3周ぶんのコンテンツになる。
   */
  tierProgression: TierId[];
  /** ティアごとの優勝報酬（BP）。 */
  bpByTier: Partial<Record<TierId, number>>;
  /**
   * ティアごとのレンタルの強さ。v0.8 で手持ち持ち込みになるまでの措置。
   *
   * **ティアと同じ投資水準を貸す。** 原作ティアは持ち物も努力値も無い相手なので、
   * 仕上がったレンタルを貸すと勝率98%になり、カップが演出になってしまう。
   *
   * 施設（v0.5）では逆に「相手より強いレンタル」が必要だった。
   * あちらは連勝なので勝率が n 乗され、五分だと必ず1連勝で止まるため。
   * **同じ「レンタルの強さ」でも、連戦か勝ち抜きかで正解が逆になる。**
   */
  rentalGradeByTier: Partial<Record<TierId, Grade>>;
};

/** そのティアで貸し出す個体の grade。 */
export const rentalGradeFor = (cup: Tournament, tier: TierId): Grade =>
  cup.rentalGradeByTier[tier] ?? 4;

/** 1回の挑戦の途中状態。1戦ごとに保存でき、途中から再開できる。 */
export type TournamentRun = {
  cup: CupId;
  tier: TierId;
  team: PartySpec[];
  /** 抽選済みの対戦相手。最初に全員決めるので、山が途中で変わらない。 */
  bracket: NamedId[];
  /** 何戦目か（0 起点）。 */
  round: number;
  rng: RngState;
  state: "inProgress" | "won" | "lost";
};

/** そのカップで今遊べるティア。ひとつ前を優勝していないと開かない。 */
export function availableTiers(
  cup: Tournament,
  cleared: readonly TierId[],
): { tier: TierId; unlocked: boolean }[] {
  let previousCleared = true;
  return cup.tierProgression.map((tier) => {
    const unlocked = previousCleared;
    previousCleared = cleared.includes(tier);
    return { tier, unlocked };
  });
}

export function nextTier(cup: Tournament, cleared: readonly TierId[]): TierId | null {
  return availableTiers(cup, cleared).find((t) => t.unlocked && !cleared.includes(t.tier))?.tier
    ?? null;
}

/**
 * 出場者を抽選して山を作る。
 *
 * **決め打ちにしない。** 毎回同じ顔ぶれだとリプレイ性が消える。
 * 一方で1回の挑戦の中では固定する ―― 途中で山が変わると再開できない。
 */
export function drawBracket(
  cup: Tournament,
  entrants: readonly NamedCharacter[],
  tier: TierId,
  seed: number,
): { bracket: NamedId[]; rng: RngState } {
  const eligible = entrants.filter(
    (c) => cup.entrantPool.includes(c.id) && c.tiers[tier] !== undefined,
  );
  if (eligible.length < cup.rounds) {
    throw new Error(
      `${cup.id}: ティア ${tier} の出場者が ${eligible.length} 人（${cup.rounds} 人必要）`,
    );
  }

  const rng = createRng(createRngState(seed));
  const pool = [...eligible];
  const bracket: NamedId[] = [];
  for (let i = 0; i < cup.rounds; i++) {
    bracket.push(pool.splice(rng.int(pool.length), 1)[0]!.id);
  }
  return { bracket, rng: rng.state() };
}

export function startCupRun(
  cup: Tournament,
  entrants: readonly NamedCharacter[],
  tier: TierId,
  team: readonly PartySpec[],
  seed: number,
): TournamentRun {
  const { bracket, rng } = drawBracket(cup, entrants, tier, seed);
  return {
    cup: cup.id,
    tier,
    team: team.map((m) => ({ ...m })),
    bracket,
    round: 0,
    rng,
    state: "inProgress",
  };
}

/** 今の相手。 */
export function currentOpponent(
  run: TournamentRun,
  entrants: readonly NamedCharacter[],
): NamedCharacter {
  const id = run.bracket[run.round];
  const character = entrants.find((c) => c.id === id);
  if (character === undefined) throw new Error(`出場者が見つからない: ${String(id)}`);
  return character;
}

/** 相手のパーティ。ルールセットの体数とレベル同期を適用済み。 */
export function opponentParty(
  data: GameData,
  cup: Tournament,
  run: TournamentRun,
  character: NamedCharacter,
): PartySpec[] {
  const level =
    cup.ruleset.levelMode.kind === "sync" ? syncedLevel(cup.ruleset, 50) : null;
  return partyFor(data, character, run.tier, cup.ruleset.teamSize, level);
}

/** 自分側のパーティ。施設側の playerParty と紛れないよう名前を分けてある。 */
export function cupPlayerParty(cup: Tournament, run: TournamentRun): PartySpec[] {
  return run.team.map((m) => ({ ...m, level: syncedLevel(cup.ruleset, m.level) }));
}

/**
 * 1戦の結果を反映する。
 *
 * 施設と違い、トーナメントは **1敗で終わり**。
 * だから連戦の途中で報酬を刻まず、優勝時にまとめて渡す。
 */
export function applyCupOutcome(
  cup: Tournament,
  run: TournamentRun,
  won: boolean,
): { run: TournamentRun; gainedBp: number; champion: boolean } {
  if (!won) {
    return { run: { ...run, state: "lost" }, gainedBp: 0, champion: false };
  }
  const round = run.round + 1;
  const champion = round >= cup.rounds;
  return {
    run: { ...run, round, state: champion ? "won" : "inProgress" },
    gainedBp: champion ? (cup.bpByTier[run.tier] ?? 0) : 0,
    champion,
  };
}

/** ティアの表示順を固定する（データの順に依存させない）。 */
export const tierOrder = (tier: TierId): number => TIERS.indexOf(tier);

/** カップが使うティアの出場者が足りているか。検証と起動時の確認に使う。 */
export function assertCupUsable(
  cup: Tournament,
  entrants: readonly NamedCharacter[],
): void {
  for (const id of cup.entrantPool) {
    if (!entrants.some((c) => c.id === id)) {
      throw new Error(`${cup.id}: 出場者 ${id} が存在しない`);
    }
  }
  for (const tier of cup.tierProgression) {
    const count = entrants.filter(
      (c) => cup.entrantPool.includes(c.id) && c.tiers[tier] !== undefined,
    ).length;
    if (count < cup.rounds) {
      throw new Error(`${cup.id}/${tier}: 出場者が ${count} 人（${cup.rounds} 人必要）`);
    }
  }
}
