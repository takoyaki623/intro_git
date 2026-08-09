import hajimari from './hajimari.js';
import myhouse from './myhouse.js';
import center from './center.js';
import route1 from './route1.js';
import forest from './forest.js';

export const MAPS = { hajimari, myhouse, center, route1, forest };

export const getMap = (id) => MAPS[id] ?? null;

/** マップの幅・高さ（タイル数） */
export const mapWidth = (map) => map.tiles[0].length;
export const mapHeight = (map) => map.tiles.length;

/** (x,y) のタイルキー。範囲外は null。 */
export function tileKeyAt(map, x, y) {
  if (y < 0 || y >= map.tiles.length) return null;
  const row = map.tiles[y];
  if (x < 0 || x >= row.length) return null;
  return map.legend[row[x]] ?? null;
}
