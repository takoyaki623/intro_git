/**
 * ルールセットと相手プール（v0.5）。
 *
 * 施設をハードコードしない。施設 = ルールセット + 相手プール + 報酬 の3データ。
 * これが「施設を安く量産する」ための土台になる。
 * タイプ縛りカップが `requiredType` の差し替えだけで18施設になるのは、この形のため。
 *
 * 設計: docs/design/endgame.md §4・§6
 */

import type { GameData } from "../gamedata.js";
import type { PartySpec } from "../normalize.js";
import type { Rng } from "../rng.js";
import { ZERO_STATS } from "../stats.js";
import type {
  AbilityId,
  ItemId,
  MoveId,
  NatureId,
  SpeciesId,
  StatSpread,
  Type,
} from "../types.js";

export type JudgeRule = { criteria: ("hpRatio" | "damageDealt" | "movesHit")[] };

export type Ruleset = {
  // 編成
  teamSize: number;
  battleSize: number;
  teamSource: "own" | "rental" | "hallOfFame";
  levelMode: { kind: "sync"; level: 50 | 100 } | { kind: "asIs" };
  duplicateSpecies: boolean;
  duplicateItems: boolean;
  bannedSpecies?: SpeciesId[];
  requiredType?: Type;

  // バトル
  battleFormat: "single" | "double";
  itemsAllowed: boolean;
  winCondition: { kind: "faint" } | { kind: "turnLimit"; turns: number; judge: JudgeRule };
  moveSelection: "player" | "auto";

  // 連戦
  streakLength: number | "endless";
  healBetweenBattles: boolean;
  carryOverDamage: boolean;
  swapAfterWin?: "factory";
};

export type Grade = 1 | 2 | 3 | 4;

/**
 * 施設の相手1体ぶんの設計図。
 *
 * 個体値は grade から導く。数千件すべてに個体値を手書きさせないための決定。
 * 特別な調整が要る個体だけ ivs を明示する。
 */
export type BattleSet = {
  id: string;
  species: SpeciesId;
  moves: MoveId[];
  item: ItemId;
  ability: AbilityId;
  nature: NatureId;
  evs: Partial<StatSpread>;
  ivs?: StatSpread;
  grade: Grade;
  tags: string[];
};

/** 調整項目。grade 1 は個体値が低く、grade 4 は全て31。 */
export const DEFAULT_IVS_BY_GRADE: Record<Grade, number> = { 1: 0, 2: 10, 3: 20, 4: 31 };

/**
 * 努力値も grade で割り引く。
 *
 * 個体値だけを段階にすると、実数値の差が小さすぎて grade がほとんど効かない。
 * 個体値の差は最大でも各能力 +15（Lv50 で +7）にしかならないのに対し、
 * 努力値252は +31 動く。**強さの段階を作っているのは実質こちら。**
 *
 * BattleSet 側に書いた努力値は「その個体の役割」を表すので、割合だけを落とす。
 */
export const DEFAULT_EV_RATIO_BY_GRADE: Record<Grade, number> = {
  1: 0,
  2: 0.5,
  3: 0.75,
  4: 1,
};

const spread = (n: number): StatSpread => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });

/** BattleSet を、バトルエンジンが受け取れる形に落とす。 */
export function battleSetToSource(set: BattleSet, level: number): PartySpec {
  const ratio = DEFAULT_EV_RATIO_BY_GRADE[set.grade];
  const evs = { ...ZERO_STATS };
  for (const [stat, value] of Object.entries(set.evs)) {
    evs[stat as keyof StatSpread] = Math.floor(value * ratio);
  }
  return {
    species: set.species,
    level,
    moves: set.moves,
    ability: set.ability,
    item: set.item,
    nature: set.nature,
    ivs: set.ivs ?? spread(DEFAULT_IVS_BY_GRADE[set.grade]),
    evs,
  };
}

/**
 * プールから相手パーティを組む。
 *
 * 種族と持ち物の重複を避ける。同じ顔ぶれが続くと「同じ相手ばかり」に見えるため、
 * tags が同じものが偏らないよう、抽選のたびに候補から外していく。
 */
export function buildOpponentParty(
  pool: readonly BattleSet[],
  grade: Grade,
  size: number,
  rng: Rng,
): BattleSet[] {
  const candidates = pool.filter((s) => s.grade === grade);
  if (candidates.length < size) {
    throw new Error(`grade ${grade} の BattleSet が ${candidates.length} 件しかない（${size} 件必要）`);
  }

  const chosen: BattleSet[] = [];
  const usedSpecies = new Set<SpeciesId>();
  const usedItems = new Set<ItemId>();
  const usedTags = new Set<string>();

  while (chosen.length < size) {
    const strict = candidates.filter(
      (s) =>
        !usedSpecies.has(s.species) &&
        !usedItems.has(s.item) &&
        !s.tags.some((t) => usedTags.has(t)),
    );
    // tags の分散は「できれば」の条件。満たせなければ種族と持ち物だけ守る
    const loose = candidates.filter(
      (s) => !usedSpecies.has(s.species) && !usedItems.has(s.item),
    );
    const fallback = candidates.filter((s) => !usedSpecies.has(s.species));
    const from = strict.length > 0 ? strict : loose.length > 0 ? loose : fallback;

    const pick = rng.pick(from);
    chosen.push(pick);
    usedSpecies.add(pick.species);
    usedItems.add(pick.item);
    for (const t of pick.tags) usedTags.add(t);
  }
  return chosen;
}

/**
 * ルールセットに照らして、その編成が持ち込めるかを判定する。
 * UI が「なぜ選べないか」を出せるよう、理由を文字列で返す。
 */
export function validateTeam(
  data: GameData,
  rules: Ruleset,
  team: readonly PartySpec[],
): string[] {
  const problems: string[] = [];
  if (team.length !== rules.teamSize) {
    problems.push(`${rules.teamSize}体 えらんでください`);
  }
  if (!rules.duplicateSpecies) {
    const seen = new Set<SpeciesId>();
    for (const m of team) {
      if (seen.has(m.species)) problems.push(`${data.species(m.species).name} が だぶっています`);
      seen.add(m.species);
    }
  }
  if (!rules.duplicateItems) {
    const seen = new Set<ItemId>();
    for (const m of team) {
      if (m.item === undefined) continue;
      if (seen.has(m.item)) problems.push(`${data.item(m.item).name} が だぶっています`);
      seen.add(m.item);
    }
  }
  for (const m of team) {
    if (rules.bannedSpecies?.includes(m.species) === true) {
      problems.push(`${data.species(m.species).name} は つかえません`);
    }
    if (rules.requiredType !== undefined && !data.species(m.species).types.includes(rules.requiredType)) {
      problems.push(`${data.species(m.species).name} は タイプが あいません`);
    }
  }
  return problems;
}

/** レベル同期。双方向なので、Lv50未満の個体も持ち込める。 */
export function syncedLevel(rules: Ruleset, level: number): number {
  return rules.levelMode.kind === "sync" ? rules.levelMode.level : level;
}
