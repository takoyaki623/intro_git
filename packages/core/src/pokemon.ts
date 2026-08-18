/**
 * 実在する個体（v0.8）。
 *
 * v0.7 までの手持ちは `PartySpec`（「Lv5のヒトカゲ」という設計図）で、
 * バトルのたびに満タンで作り直されていた。そのため **野生戦に消耗が無く、
 * 遭遇に意味が生まれなかった**（game-plan.md §8.3 論点3の結果）。
 *
 * ここで導入する `PokemonInstance` が、その1体を持ち歩く器になる。
 * HP・PP・状態異常・経験値・なつき度がバトルをまたいで残る。
 *
 * 設計: docs/design/progression.md / docs/design/capture.md §9
 */

import { levelForExp, expForLevel, MAX_LEVEL } from "./exp.js";
import type { GameData } from "./gamedata.js";
import { toBattlePokemon, type PartySpec } from "./normalize.js";
import { calcAllStats, MAX_IVS } from "./stats.js";
import type {
  AbilityId,
  BattlePokemon,
  MoveId,
  NatureId,
  PokemonInstance,
  SpeciesId,
  StatSpread,
} from "./types.js";
import { STATS, type ItemId } from "./types.js";
export type { PokemonInstance };
import type { Rng } from "./rng.js";

export const MAX_FRIENDSHIP = 255;
const DEFAULT_FRIENDSHIP = 70;
const SHINY_CHANCE = 1 / 4096;

/** レベルは経験値から導く。**個体に level を持たせない。** */
export const levelOf = (data: GameData, instance: PokemonInstance): number =>
  levelForExp(data, data.species(instance.species).expType, instance.exp);

/** 今のレベルでの実数値。 */
export function statsOf(data: GameData, instance: PokemonInstance): StatSpread {
  const species = data.species(instance.species);
  return calcAllStats(data, species, levelOf(data, instance), instance.ivs, instance.evs, instance.nature);
}

export const maxHpOf = (data: GameData, instance: PokemonInstance): number =>
  statsOf(data, instance).hp;

const randomSpread = (rng: Rng): StatSpread => {
  const out = {} as StatSpread;
  for (const stat of STATS) out[stat] = rng.int(MAX_IVS.hp + 1);
  return out;
};

const zeroSpread = (): StatSpread => {
  const out = {} as StatSpread;
  for (const stat of STATS) out[stat] = 0;
  return out;
};

/** そのレベルまでに覚えているレベル技（後ろから4つ）。 */
export function movesAtLevel(data: GameData, species: SpeciesId, level: number): MoveId[] {
  return data
    .species(species)
    .learnset.filter((l) => l.level <= level)
    .map((l) => l.move)
    .slice(-4);
}

export type CreateOptions = {
  species: SpeciesId;
  level: number;
  region: string;
  /** 省略時は learnset から。 */
  moves?: MoveId[];
  nickname?: string;
  ability?: AbilityId;
  nature?: NatureId;
  item?: ItemId;
  friendship?: number;
};

/**
 * 個体を作る。野生・もらいもの・イベントの全てがここを通る。
 * 個体値・性格・性別・色違いはここで一度だけ決まり、以後変わらない。
 */
export function createInstance(
  data: GameData,
  options: CreateOptions,
  rng: Rng,
  natures: readonly NatureId[],
): PokemonInstance {
  const species = data.species(options.species);
  const level = Math.max(1, Math.min(MAX_LEVEL, options.level));
  const moves = options.moves ?? movesAtLevel(data, species.id, level);

  const genderRatio = species.genderRatio;
  const gender =
    genderRatio === null ? null : rng.next() < genderRatio ? "male" : "female";

  const instance: PokemonInstance = {
    uid: newUid(rng),
    species: species.id,
    exp: expForLevel(data, species.expType, level),
    ivs: randomSpread(rng),
    evs: zeroSpread(),
    nature: options.nature ?? rng.pick(natures),
    ability: options.ability ?? species.abilities[0] ?? "",
    moves: moves.map((id) => ({ id, pp: data.move(id).pp })),
    currentHp: 0, // 下で満タンにする
    status: null,
    statusCounter: 0,
    item: options.item ?? null,
    friendship: options.friendship ?? DEFAULT_FRIENDSHIP,
    shiny: rng.next() < SHINY_CHANCE,
    gender,
    met: { region: options.region, level },
  };
  if (options.nickname !== undefined) instance.nickname = options.nickname;
  instance.currentHp = maxHpOf(data, instance);
  return instance;
}

const newUid = (rng: Rng): string =>
  Array.from({ length: 4 }, () => rng.int(0x10000).toString(16).padStart(4, "0")).join("");

/**
 * バトルに出す形へ変換する。
 *
 * `PartySpec` と違い、**今の HP・PP・状態異常をそのまま持ち込む。**
 * これがあって初めて「野生戦で消耗する」が成立する。
 * 正規化そのものは `toBattlePokemon` に任せる ―― 入口は1つに保つ。
 */
export const instanceToBattle = (
  data: GameData,
  instance: PokemonInstance,
  levelOverride?: number,
): BattlePokemon => toBattlePokemon(data, instanceToSpec(data, instance), levelOverride);

/**
 * バトルの結果を個体へ書き戻す。
 *
 * **ランク補正・混乱のような「その場限りのもの」は戻さない。**
 * 残すのは HP・PP・状態異常だけ ―― バトルの外に持ち出す意味があるのはこれだけ。
 */
export function writeBack(
  data: GameData,
  instance: PokemonInstance,
  after: BattlePokemon,
): PokemonInstance {
  // レベル同期で最大HPが違いうるので、割合で戻す
  const full = maxHpOf(data, instance);
  const ratio = after.maxHp === 0 ? 0 : after.currentHp / after.maxHp;
  const hp = after.currentHp === 0 ? 0 : Math.max(1, Math.round(full * ratio));

  return {
    ...instance,
    currentHp: Math.min(full, hp),
    status: after.status,
    statusCounter: after.status === "toxic" ? after.statusCounter : 0,
    moves: instance.moves.map((m, i) => ({ ...m, pp: after.moves[i]?.pp ?? m.pp })),
  };
}

/** ポケモンセンター。HP・PP・状態異常を全て戻す。 */
export function healInstance(data: GameData, instance: PokemonInstance): PokemonInstance {
  return {
    ...instance,
    currentHp: maxHpOf(data, instance),
    status: null,
    statusCounter: 0,
    moves: instance.moves.map((m) => ({ ...m, pp: data.move(m.id).pp })),
  };
}

export const healParty = (data: GameData, party: readonly PokemonInstance[]): PokemonInstance[] =>
  party.map((p) => healInstance(data, p));

export const isFainted = (instance: PokemonInstance): boolean => instance.currentHp <= 0;
export const canFight = (party: readonly PokemonInstance[]): boolean => party.some((p) => !isFainted(p));

/**
 * 設計図の形へ落とす。**バトルに出る道はここ1本だけ。**
 *
 * 今の HP は割合で渡す。レベル同期（施設）で最大HPが変わっても、
 * 「半分減っている」という事実が保たれる。
 */
export function instanceToSpec(data: GameData, instance: PokemonInstance): PartySpec {
  const full = maxHpOf(data, instance);
  const spec: PartySpec = {
    species: instance.species,
    level: levelOf(data, instance),
    moves: instance.moves.map((m) => m.id),
    ivs: instance.ivs,
    evs: instance.evs,
    nature: instance.nature,
    ability: instance.ability,
    uid: instance.uid,
    hpRatio: full === 0 ? 0 : instance.currentHp / full,
    ppLeft: instance.moves.map((m) => m.pp),
  };
  if (instance.nickname !== undefined) spec.nickname = instance.nickname;
  if (instance.item !== null) spec.item = instance.item;
  if (instance.status !== null) spec.status = instance.status;
  return spec;
}
