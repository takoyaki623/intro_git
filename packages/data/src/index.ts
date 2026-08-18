/**
 * packages/data — マスタデータと GameData の実装。
 *
 * core はこのパッケージを型としてしか知らない。実体を渡すのは呼び出し側。
 * 設計: docs/design/data-schema.md
 */

import {
  assertCompleteTypeChart,
  MissingDataError,
  TYPES,
  type Ability,
  type Ball,
  type BattleSet,
  type EncounterTable,
  type ExpType,
  type EventScript,
  type FlagId,
  type MapData,
  type Shop,
  type Trainer,
  type Facility,
  type GameData,
  type NamedCharacter,
  type Tournament,
  type Item,
  type Move,
  type NatureModifier,
  type Species,
  type Type,
  type TypeChart,
} from "@pkmn/core";

import abilitiesJson from "../abilities.json" with { type: "json" };
import ballsJson from "../balls.json" with { type: "json" };
import battleSetsJson from "../battle-sets.json" with { type: "json" };
import expTablesJson from "../exp-tables.json" with { type: "json" };
import encountersJson from "../encounters.json" with { type: "json" };
import eventsJson from "../events.json" with { type: "json" };
import flagsJson from "../flags.json" with { type: "json" };
import shopsJson from "../shops.json" with { type: "json" };
import mapsJson from "../maps.json" with { type: "json" };
import trainersJson from "../trainers.json" with { type: "json" };
import facilitiesJson from "../facilities.json" with { type: "json" };
import itemsJson from "../items.json" with { type: "json" };
import namedJson from "../named.json" with { type: "json" };
import movesJson from "../moves.json" with { type: "json" };
import naturesJson from "../natures.json" with { type: "json" };
import speciesJson from "../species.json" with { type: "json" };
import tournamentsJson from "../tournaments.json" with { type: "json" };
import typeChartJson from "../type-chart.json" with { type: "json" };

/**
 * 相性表は「1倍を省略した疎な形」で持ち、ここで 18×18 に展開する。
 * 324 セルを手書きすると必ず書き間違えるため、例外だけを書く。
 * 展開後に完全性を検証するので、設計の検証項目 #2 は満たされる。
 */
function expandTypeChart(sparse: Record<string, Record<string, number>>): TypeChart {
  const chart = {} as TypeChart;
  for (const atk of TYPES) {
    const row = {} as Record<Type, number>;
    const overrides = sparse[atk] ?? {};
    for (const def of TYPES) {
      row[def] = overrides[def] ?? 1;
    }
    chart[atk] = row;
  }
  assertCompleteTypeChart(chart);
  return chart;
}

function indexById<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`duplicate id: "${item.id}"`);
    map.set(item.id, item);
  }
  return map;
}

const speciesById = indexById(speciesJson as unknown as Species[]);
const movesById = indexById(movesJson as unknown as Move[]);
const naturesById = indexById(naturesJson as unknown as NatureModifier[]);
const abilitiesById = indexById(abilitiesJson as unknown as Ability[]);
const itemsById = indexById(itemsJson as unknown as Item[]);
const typeChart = expandTypeChart(
  typeChartJson as unknown as Record<string, Record<string, number>>,
);

const ballsById = indexById(ballsJson as unknown as Ball[]);
const expTables = expTablesJson as unknown as Record<string, readonly number[]>;

/** 成長曲線。テーブルなので参照するだけ（progression.md §7）。 */
function expTable(type: ExpType): readonly number[] {
  const table = expTables[type];
  if (table === undefined) throw new MissingDataError("exp-table", type);
  return table;
}

/**
 * 完全なマスタデータ。
 * テストでは代わりに部分的な GameData を渡せる（createGameData を参照）。
 */
export const gameData: GameData = {
  species: (id) => {
    const s = speciesById.get(id);
    if (s === undefined) throw new MissingDataError("species", id);
    return s;
  },
  move: (id) => {
    const m = movesById.get(id);
    if (m === undefined) throw new MissingDataError("move", id);
    return m;
  },
  nature: (id) => {
    const n = naturesById.get(id);
    if (n === undefined) throw new MissingDataError("nature", id);
    return n;
  },
  ability: (id) => {
    const a = abilitiesById.get(id);
    if (a === undefined) throw new MissingDataError("ability", id);
    return a;
  },
  item: (id) => {
    const i = itemsById.get(id);
    if (i === undefined) throw new MissingDataError("item", id);
    return i;
  },
  ball: (id) => {
    const b = ballsById.get(id);
    if (b === undefined) throw new MissingDataError("ball", id);
    return b;
  },
  expTable,
  typeChart,
};

/**
 * 任意の部分集合から GameData を作る。
 * v0.1 の眼目である「core にデータを注入できること」を、テストで示すための入口。
 */
export function createGameData(options: {
  species?: readonly Species[];
  moves?: readonly Move[];
  natures?: readonly NatureModifier[];
  abilities?: readonly Ability[];
  items?: readonly Item[];
  typeChart?: TypeChart;
}): GameData {
  const sp = indexById(options.species ?? (speciesJson as unknown as Species[]));
  const mv = indexById(options.moves ?? (movesJson as unknown as Move[]));
  const na = indexById(options.natures ?? (naturesJson as unknown as NatureModifier[]));
  const ab = indexById(options.abilities ?? (abilitiesJson as unknown as Ability[]));
  const it = indexById(options.items ?? (itemsJson as unknown as Item[]));
  const tc = options.typeChart ?? typeChart;

  return {
    species: (id) => {
      const s = sp.get(id);
      if (s === undefined) throw new MissingDataError("species", id);
      return s;
    },
    move: (id) => {
      const m = mv.get(id);
      if (m === undefined) throw new MissingDataError("move", id);
      return m;
    },
    nature: (id) => {
      const n = na.get(id);
      if (n === undefined) throw new MissingDataError("nature", id);
      return n;
    },
    ability: (id) => {
      const a = ab.get(id);
      if (a === undefined) throw new MissingDataError("ability", id);
      return a;
    },
    item: (id) => {
      const i = it.get(id);
      if (i === undefined) throw new MissingDataError("item", id);
      return i;
    },
    ball: (id) => {
      const b = ballsById.get(id);
      if (b === undefined) throw new MissingDataError("ball", id);
      return b;
    },
    expTable,
    typeChart: tc,
  };
}

export const allSpecies = speciesJson as unknown as readonly Species[];
export const allNatures = naturesJson as unknown as readonly NatureModifier[];
export const allBalls = ballsJson as unknown as readonly Ball[];
export const allMoves = movesJson as unknown as readonly Move[];
export const allAbilities = abilitiesJson as unknown as readonly Ability[];
export const allItems = itemsJson as unknown as readonly Item[];
export const allBattleSets = battleSetsJson as unknown as readonly BattleSet[];
export const allFacilities = facilitiesJson as unknown as readonly Facility[];

export function facilityById(id: string): Facility {
  const f = allFacilities.find((x) => x.id === id);
  if (f === undefined) throw new MissingDataError("facility", id);
  return f;
}

export const allNamed = namedJson as unknown as readonly NamedCharacter[];
export const allTournaments = tournamentsJson as unknown as readonly Tournament[];

export function namedById(id: string): NamedCharacter {
  const c = allNamed.find((x) => x.id === id);
  if (c === undefined) throw new MissingDataError("named", id);
  return c;
}

export function tournamentById(id: string): Tournament {
  const t = allTournaments.find((x) => x.id === id);
  if (t === undefined) throw new MissingDataError("tournament", id);
  return t;
}

// ─────────────────────────────────────────────
// 世界（v0.7）
//
// マップ・イベント・トレーナーも「core は型としてしか知らない」を守る。
// core 側の関数は必ず引数で受け取り、ここを import しない。
// ─────────────────────────────────────────────

export const allMaps = mapsJson as unknown as readonly MapData[];
export const allEvents = eventsJson as unknown as readonly EventScript[];
export const allEncounterTables = encountersJson as unknown as readonly EncounterTable[];
export const allTrainers = trainersJson as unknown as readonly Trainer[];
/** 宣言済みフラグ。ここに無いフラグを使うと検証エラーになる（world.md §6）。 */
export const allFlags = flagsJson as unknown as readonly FlagId[];
export const allShops = shopsJson as unknown as readonly Shop[];

export function shopById(id: string): Shop {
  const s = allShops.find((x) => x.id === id);
  if (s === undefined) throw new MissingDataError("shop", id);
  return s;
}

export function mapById(id: string): MapData {
  const m = allMaps.find((x) => x.id === id);
  if (m === undefined) throw new MissingDataError("map", id);
  return m;
}

export function eventById(id: string): EventScript {
  const e = allEvents.find((x) => x.id === id);
  if (e === undefined) throw new MissingDataError("event", id);
  return e;
}

export function trainerById(id: string): Trainer {
  const t = allTrainers.find((x) => x.id === id);
  if (t === undefined) throw new MissingDataError("trainer", id);
  return t;
}
