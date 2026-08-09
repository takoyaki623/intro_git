// マップ上の world（今いるマップ、プレイヤー、NPC）の状態と移動ロジック。
// 描画は FieldScene が持ち、ここは「動かす」ことだけを担当する。

import { getMap, mapWidth, mapHeight, tileKeyAt } from '../data/maps/index.js';
import { TILE } from '../data/tiles.js';
import { state } from './state.js';
import { rng } from '../core/rng.js';

export const WALK_FRAMES = 16;
export const RUN_FRAMES = 9;
export const TURN_FRAMES = 6;

export const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const world = {
  map: null,
  player: {
    tx: 0, ty: 0, dir: 'down',
    px: 0, py: 0,          // ピクセル座標（トゥイーン中の中間値）
    moving: false, t: 0, frames: WALK_FRAMES,
    fromX: 0, fromY: 0, toX: 0, toY: 0,
    turning: 0,
    stepParity: 0,
  },
  npcs: [],
  frozen: false,           // 会話中などは動かさない
  anim: 0,                 // 水などのアニメーション用カウンタ
};

export function loadMap(mapId, tx, ty, dir = 'down') {
  const map = getMap(mapId);
  if (!map) throw new Error(`未知のマップ: ${mapId}`);

  world.map = map;
  const p = world.player;
  p.tx = tx; p.ty = ty; p.dir = dir;
  p.px = tx * 16; p.py = ty * 16;
  p.moving = false; p.t = 0; p.turning = 0;
  p.fromX = p.toX = p.px;
  p.fromY = p.toY = p.py;

  world.npcs = (map.npcs ?? []).map((n) => ({
    ...n,
    tx: n.x, ty: n.y, dir: n.dir ?? 'down',
    px: n.x * 16, py: n.y * 16,
    moving: false, t: 0, fromX: n.x * 16, fromY: n.y * 16,
    toX: n.x * 16, toY: n.y * 16,
    stepParity: 0,
    wanderCooldown: rng.int(90, 240),
  }));

  state.player.pos = { map: mapId, x: tx, y: ty, dir };
  state.stepsSinceEncounter = 0;
  return map;
}

export const width = () => mapWidth(world.map);
export const height = () => mapHeight(world.map);
export const tileAt = (x, y) => tileKeyAt(world.map, x, y);

/** そのタイルに立てるか */
export function isWalkable(x, y, { ignoreNpc = false } = {}) {
  const key = tileAt(x, y);
  if (!key) return false;
  if (TILE[key]?.solid) return false;
  if (!ignoreNpc) {
    if (world.npcs.some((n) => n.tx === x && n.ty === y)) return false;
    const p = world.player;
    if (p.tx === x && p.ty === y) return false;
  }
  return true;
}

/** 今プレイヤーが向いている先のタイル座標 */
export function facingTile() {
  const p = world.player;
  const d = DIRS[p.dir];
  return { x: p.tx + d.dx, y: p.ty + d.dy };
}

/**
 * 向いている先の話し相手を探す。
 * カウンター越し（talkThrough）なら1マス先まで見る。
 */
export function facingTarget() {
  const p = world.player;
  const d = DIRS[p.dir];

  for (let step = 1; step <= 2; step++) {
    const x = p.tx + d.dx * step;
    const y = p.ty + d.dy * step;

    const npc = world.npcs.find((n) => n.tx === x && n.ty === y);
    if (npc) return { type: 'npc', npc };

    const sign = (world.map.signs ?? []).find((s) => s.x === x && s.y === y);
    if (sign) return { type: 'sign', sign };

    const key = tileAt(x, y);
    if (step === 1) {
      if (TILE[key]?.pc) return { type: 'pc' };
      if (TILE[key]?.heal) return { type: 'bed' };
    }
    // 2マス先を見るのはカウンター越しのときだけ
    if (!TILE[key]?.talkThrough) break;
  }
  return null;
}

/** その場で振り向く */
export function face(dir) {
  world.player.dir = dir;
  state.player.pos.dir = dir;
}

/**
 * 1マス歩き始める。歩けないときは向きだけ変えて false を返す。
 */
export function tryStep(dir, running = false) {
  const p = world.player;
  if (p.moving || p.turning > 0 || world.frozen) return false;

  // 向きが違うならまず振り向く。この「ため」があると本家の手触りになる。
  if (p.dir !== dir) {
    face(dir);
    p.turning = TURN_FRAMES;
    return false;
  }

  const d = DIRS[dir];
  const nx = p.tx + d.dx;
  const ny = p.ty + d.dy;
  if (!isWalkable(nx, ny)) return false;

  p.moving = true;
  p.t = 0;
  p.frames = running ? RUN_FRAMES : WALK_FRAMES;
  p.fromX = p.tx * 16; p.fromY = p.ty * 16;
  p.toX = nx * 16; p.toY = ny * 16;
  p.tx = nx; p.ty = ny;
  return true;
}

/**
 * プレイヤーの移動を1フレーム進める。
 * 1マス歩き終わったフレームで { stepped:true, tile, warp } を返す。
 */
export function updatePlayer() {
  const p = world.player;

  if (p.turning > 0) {
    p.turning--;
    return null;
  }
  if (!p.moving) return null;

  p.t++;
  const r = Math.min(1, p.t / p.frames);
  p.px = p.fromX + (p.toX - p.fromX) * r;
  p.py = p.fromY + (p.toY - p.fromY) * r;

  if (p.t < p.frames) return null;

  // 到達
  p.moving = false;
  p.px = p.toX;
  p.py = p.toY;
  p.stepParity ^= 1;
  state.player.pos.x = p.tx;
  state.player.pos.y = p.ty;

  const tile = tileAt(p.tx, p.ty);
  const warp = (world.map.warps ?? []).find((w) => w.x === p.tx && w.y === p.ty) ?? null;
  return { stepped: true, tile, warp };
}

/** NPC のうろうろ移動 */
export function updateNpcs() {
  world.anim++;

  for (const n of world.npcs) {
    if (n.moving) {
      n.t++;
      const r = Math.min(1, n.t / WALK_FRAMES);
      n.px = n.fromX + (n.toX - n.fromX) * r;
      n.py = n.fromY + (n.toY - n.fromY) * r;
      if (n.t >= WALK_FRAMES) {
        n.moving = false;
        n.px = n.toX; n.py = n.toY;
        n.stepParity ^= 1;
        n.wanderCooldown = rng.int(90, 240);
      }
      continue;
    }

    if (!n.wander || world.frozen) continue;
    if (--n.wanderCooldown > 0) continue;

    const dir = rng.pick(['up', 'down', 'left', 'right']);
    const d = DIRS[dir];
    n.dir = dir;
    const nx = n.tx + d.dx;
    const ny = n.ty + d.dy;
    // 元の位置から2マス以上離れない（うろついて迷子にならないように）
    const far = Math.abs(nx - n.x) > 1 || Math.abs(ny - n.y) > 1;
    if (far || !isWalkable(nx, ny)) {
      n.wanderCooldown = rng.int(60, 150);
      continue;
    }
    n.moving = true;
    n.t = 0;
    n.fromX = n.tx * 16; n.fromY = n.ty * 16;
    n.toX = nx * 16; n.toY = ny * 16;
    n.tx = nx; n.ty = ny;
  }
}

/** NPC をプレイヤーのほうへ向かせる（話しかけたとき） */
export function faceNpcToPlayer(npc) {
  const p = world.player;
  const dx = p.tx - npc.tx;
  const dy = p.ty - npc.ty;
  if (Math.abs(dx) > Math.abs(dy)) npc.dir = dx > 0 ? 'right' : 'left';
  else npc.dir = dy > 0 ? 'down' : 'up';
}

/** 歩行アニメのコマ番号（0=立ち, 1/2=歩き） */
export function walkFrame(actor) {
  if (!actor.moving) return 0;
  const half = actor.t < (actor.frames ?? WALK_FRAMES) / 2;
  return half ? 1 + actor.stepParity : 2 - actor.stepParity;
}
