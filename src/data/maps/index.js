import hajimari from './hajimari.js';
import myhouse from './myhouse.js';
import center from './center.js';
import mart from './mart.js';
import gym from './gym.js';
import route1 from './route1.js';
import forest from './forest.js';
import route2 from './route2.js';
import nibi from './nibi.js';
import center2 from './center2.js';
import mart2 from './mart2.js';
import gym2 from './gym2.js';
import cave1 from './cave1.js';
import cave2 from './cave2.js';

export const MAPS = {
  hajimari, myhouse, center, mart, gym, route1, forest,
  route2, nibi, center2, mart2, gym2, cave1, cave2,
};

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
