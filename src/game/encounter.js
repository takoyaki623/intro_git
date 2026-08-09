// 草むらの野生エンカウント判定。

import { TILE } from '../data/tiles.js';
import { state } from './state.js';
import { createMonster } from './monster.js';

const MIN_STEPS = 3; // 遭遇直後の連続エンカウントを抑える

/**
 * 1歩ぶんの判定。遭遇しないときは null。
 * 遭遇したら { speciesId, level }。
 */
export function stepCheck(map, tileKey, rng) {
  if (!map.encounters) return null;
  if (!TILE[tileKey]?.grass) return null;

  state.stepsSinceEncounter++;
  if (state.stepsSinceEncounter < MIN_STEPS) return null;
  if (!rng.chance(map.encounters.rate / 100)) return null;

  state.stepsSinceEncounter = 0;
  const e = rng.weighted(map.encounters.table);
  return { speciesId: e.id, level: rng.int(e.min, e.max) };
}

/** 判定結果から実際の個体を作る */
export function spawnWild(enc, mapId, rng) {
  return createMonster(enc.speciesId, enc.level, { rng, metMap: mapId });
}
