// 野生エンカウント判定。草むら・水上（なみのり）・つりの3経路。

import { TILE } from '../data/tiles.js';
import { state } from './state.js';
import { createMonster } from './monster.js';

const MIN_STEPS = 3; // 遭遇直後の連続エンカウントを抑える

/** テーブルから1体えらぶ */
const pick = (table, rng) => {
  const e = rng.weighted(table);
  return { speciesId: e.id, level: rng.int(e.min, e.max) };
};

/** むしよけスプレー。指定歩数のあいだ、手持ち先頭より弱い野生を抑える。 */
export function setRepel(steps) {
  state.repelSteps = steps;
}

/**
 * 1歩ぶんの判定。遭遇しないときは null。
 * 遭遇したら { speciesId, level }。
 * 草むらと水上で見るテーブルが変わる。
 */
export function stepCheck(map, tileKey, rng) {
  // むしよけスプレーは歩数そのものを消費する（草むら以外の歩数も数える）。
  const repelActive = state.repelSteps > 0;
  if (repelActive) state.repelSteps--;

  const onWater = !!TILE[tileKey]?.water;
  const enc = onWater ? map.water?.surf : map.encounters;
  if (!enc) return null;
  if (!onWater && !TILE[tileKey]?.grass) return null;

  state.stepsSinceEncounter++;
  if (state.stepsSinceEncounter < MIN_STEPS) return null;

  let table = enc.table;
  if (repelActive) {
    const lead = state.party.find((m) => m.curHP > 0);
    if (lead) {
      table = enc.table.filter((e) => e.max >= lead.level);
      if (!table.length) return null;
    }
  }

  if (!rng.chance(enc.rate / 100)) return null;

  state.stepsSinceEncounter = 0;
  return pick(table, rng);
}

/**
 * つり。かかれば { speciesId, level }、逃げられたら null。
 * power はつりざおの性能（大きいほど良いものが釣れる）。
 */
export function fishCheck(map, power, rng) {
  const spot = map.water?.fish?.[power];
  if (!spot) return null;
  if (!rng.chance(spot.chance / 100)) return null;
  return pick(spot.table, rng);
}

/** 判定結果から実際の個体を作る */
export function spawnWild(enc, mapId, rng) {
  return createMonster(enc.speciesId, enc.level, { rng, metMap: mapId });
}
