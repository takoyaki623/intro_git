/**
 * バトル施設の連戦（v0.5）。
 *
 * 施設の中身はコードではなくデータ（Facility）で決まる。
 * ここにあるのは「連勝を数え、相手の強さを上げ、BPを配り、負けたら畳む」だけ。
 * バトルタワーもファクトリーも、この関数を共有する。
 *
 * 設計: docs/design/endgame.md §8・§9 / docs/design/economy.md §9
 */

import type { GameData } from "../gamedata.js";
import type { PartySpec } from "../normalize.js";
import { createRng, createRngState } from "../rng.js";
import type { RngState } from "../types.js";
import {
  battleSetToSource,
  buildOpponentParty,
  syncedLevel,
  type BattleSet,
  type Grade,
  type Ruleset,
} from "./ruleset.js";

export type FacilityId = string;

/** 連勝数 → その帯で使う grade と AI。 */
export type GradeBand = {
  /** この連勝数までがこの帯（上限。最後の帯は Infinity）。 */
  upTo: number;
  grade: Grade;
  policy: "random" | "basic" | "smart";
  mistakeRate: number;
};

export type Facility = {
  id: FacilityId;
  name: string;
  description: string;
  ruleset: Ruleset;
  /**
   * レンタルで貸し出す個体の grade。
   *
   * 相手と同じ強さの個体を貸すと、1戦の勝率が五分になり、
   * 連勝は必ず「1勝して負ける」に落ち着く（0.5^n が効くため）。
   * **連勝が伸びる施設は、序盤の相手がはっきり弱くないと成立しない。**
   * ここを相手の band より上に置くことで、その差をデータで表す。
   */
  rentalGrade: Grade;
  bands: GradeBand[];
  /** 1戦あたりの BP。連勝が伸びるほど単価が上がる（作業ではなく達成に報いる）。 */
  bpByStreak: { upTo: number; bp: number }[];
  /**
   * v0.5 の上限。ここに達したら一度終了する。
   * AI が basic しかないため、無限連戦にすると強さが頭打ちになる。
   * 上限の解除は smart と同時（v1.1）。
   */
  streakCap: number;
};

/** 連戦の途中状態。1戦ごとに保存でき、途中から再開できる。 */
export type FacilityRun = {
  facility: FacilityId;
  /** 持ち込んだ編成（レベル同期の適用前）。 */
  team: PartySpec[];
  streak: number;
  battleIndex: number;
  /** この連戦で確定した BP。 */
  earnedBp: number;
  /** 相手生成の再現用。 */
  rng: RngState;
  /** carryOverDamage 用に、次戦へ引き継ぐ HP と PP。 */
  carried: { hp: number[]; pp: number[][] } | null;
  state: "inProgress" | "won" | "lost";
};

export function bandFor(facility: Facility, streak: number): GradeBand {
  for (const band of facility.bands) {
    if (streak <= band.upTo) return band;
  }
  return facility.bands[facility.bands.length - 1]!;
}

export function bpFor(facility: Facility, streak: number): number {
  for (const row of facility.bpByStreak) {
    if (streak <= row.upTo) return row.bp;
  }
  return facility.bpByStreak[facility.bpByStreak.length - 1]!.bp;
}

export function startRun(
  facility: Facility,
  team: readonly PartySpec[],
  seed: number,
): FacilityRun {
  return {
    facility: facility.id,
    team: team.map((m) => ({ ...m })),
    streak: 0,
    battleIndex: 0,
    earnedBp: 0,
    rng: createRngState(seed),
    carried: null,
    state: "inProgress",
  };
}

/** そのまま createBattle に渡せる、レベル同期後の自分側パーティ。 */
export function playerParty(facility: Facility, run: FacilityRun): PartySpec[] {
  return run.team.map((m) => ({ ...m, level: syncedLevel(facility.ruleset, m.level) }));
}

/**
 * 次の相手。
 *
 * run.rng を進めて返すので、同じセーブから再開すれば同じ相手が出る。
 * 「途中で中断して再開したら相手が変わった」を起こさないための決定。
 */
export function nextOpponent(
  facility: Facility,
  pool: readonly BattleSet[],
  run: FacilityRun,
): { party: PartySpec[]; sets: BattleSet[]; band: GradeBand; run: FacilityRun } {
  const band = bandFor(facility, run.streak + 1);
  const rng = createRng(run.rng);
  const sets = buildOpponentParty(pool, band.grade, facility.ruleset.teamSize, rng);
  const level = syncedLevel(facility.ruleset, 50);
  return {
    party: sets.map((s) => battleSetToSource(s, level)),
    sets,
    band,
    run: { ...run, rng: rng.state() },
  };
}

/**
 * 1戦の結果を反映する。
 *
 * 負けたら連勝はリセットされるが、**そこまでに確定した BP は残る**。
 * 「30連勝して負けたら全部消える」形にすると、挑戦そのものが割に合わなくなる。
 * 設計: docs/design/economy.md §9（施設の敗北処理）
 */
export function applyBattleOutcome(
  facility: Facility,
  run: FacilityRun,
  won: boolean,
): { run: FacilityRun; gainedBp: number; reachedCap: boolean } {
  if (!won) {
    return {
      run: { ...run, state: "lost", battleIndex: run.battleIndex + 1 },
      gainedBp: 0,
      reachedCap: false,
    };
  }

  const streak = run.streak + 1;
  const gainedBp = bpFor(facility, streak);
  const reachedCap = streak >= facility.streakCap;
  return {
    run: {
      ...run,
      streak,
      battleIndex: run.battleIndex + 1,
      earnedBp: run.earnedBp + gainedBp,
      state: reachedCap ? "won" : "inProgress",
    },
    gainedBp,
    reachedCap,
  };
}

/** その施設で使える持ち物・特性が全て存在するか（データ投入時の取りこぼし検出）。 */
export function assertPoolUsable(data: GameData, pool: readonly BattleSet[]): void {
  for (const set of pool) {
    const species = data.species(set.species);
    data.item(set.item);
    data.ability(set.ability);
    for (const move of set.moves) data.move(move);
    if (!species.abilities.includes(set.ability)) {
      throw new Error(`${set.id}: ${species.name} は特性 ${set.ability} を持たない`);
    }
  }
}
