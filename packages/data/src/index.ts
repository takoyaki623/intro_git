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
  type GameData,
  type Move,
  type NatureModifier,
  type Species,
  type Type,
  type TypeChart,
} from "@pkmn/core";

import movesJson from "../moves.json" with { type: "json" };
import naturesJson from "../natures.json" with { type: "json" };
import speciesJson from "../species.json" with { type: "json" };
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
const typeChart = expandTypeChart(
  typeChartJson as unknown as Record<string, Record<string, number>>,
);

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
  typeChart?: TypeChart;
}): GameData {
  const sp = indexById(options.species ?? (speciesJson as unknown as Species[]));
  const mv = indexById(options.moves ?? (movesJson as unknown as Move[]));
  const na = indexById(options.natures ?? (naturesJson as unknown as NatureModifier[]));
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
    typeChart: tc,
  };
}

export const allSpecies = speciesJson as unknown as readonly Species[];
export const allMoves = movesJson as unknown as readonly Move[];
