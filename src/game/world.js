// マップ上の world（今いるマップ、プレイヤー、NPC）の状態と移動ロジック。
// 描画は FieldScene が持ち、ここは「動かす」ことだけを担当する。

import { getMap, mapWidth, mapHeight, tileKeyAt } from '../data/maps/index.js';
import { TILE } from '../data/tiles.js';
import { state, getFlag, setFlag } from './state.js';
import { getTrainer, trainerFlag } from '../data/trainers.js';
import { rng } from '../core/rng.js';

export const WALK_FRAMES = 16;
export const RUN_FRAMES = 9;
export const TURN_FRAMES = 6;
export const JUMP_FRAMES = 24;   // 2マスぶん飛ぶので、歩きより少し長く

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
    jumping: false, hopY: 0,   // 段差を飛び降りている最中
  },
  npcs: [],
  items: [],               // まだ拾われていない落ちもの
  statics: [],              // ぬしポケモン（固定シンボル）
  frozen: false,           // 会話中などは動かさない
  surfing: false,          // なみのり中（水の上にいる）
  anim: 0,                 // 水などのアニメーション用カウンタ
};

/**
 * フラグによる出し分け。when が立っていない、または unless が立っていれば非表示。
 * NPC・どうぐ・ぬしポケモンで共通に使う（ライバルの出現やクリア後の交換NPCなど）。
 */
function isVisible(e) {
  if (e.when && !getFlag(e.when)) return false;
  if (e.unless && getFlag(e.unless)) return false;
  return true;
}

export function loadMap(mapId, tx, ty, dir = 'down') {
  const map = getMap(mapId);
  if (!map) throw new Error(`未知のマップ: ${mapId}`);

  const prevMap = world.map;
  world.map = map;
  // 屋外から屋内へ入った瞬間の場所を覚える。あなぬけのヒモの戻り先になる。
  if (!map.outdoor && (!prevMap || prevMap.outdoor)) {
    state.lastEntrance = { map: mapId, x: tx, y: ty, dir };
  }
  // クリア後は、リーグに入りなおすたびに4連戦をやり直せる（Q-1）。
  if (mapId === 'league' && getFlag('hallOfFame')) {
    for (const id of ['elite1', 'elite2', 'elite3', 'rival5']) setFlag(trainerFlag(id), false);
  }
  const p = world.player;
  p.tx = tx; p.ty = ty; p.dir = dir;
  p.px = tx * 16; p.py = ty * 16;
  p.moving = false; p.t = 0; p.turning = 0;
  p.jumping = false; p.hopY = 0;
  p.fromX = p.toX = p.px;
  p.fromY = p.toY = p.py;

  // マップを移った時点で陸に上がる。屋内へ入ったのに水上のまま、を防ぐ。
  world.surfing = TILE[tileKeyAt(map, tx, ty)]?.water === true;

  world.npcs = (map.npcs ?? []).filter(isVisible).map((n) => ({
    ...n,
    tx: n.x, ty: n.y, dir: n.dir ?? 'down',
    px: n.x * 16, py: n.y * 16,
    moving: false, t: 0, fromX: n.x * 16, fromY: n.y * 16,
    toX: n.x * 16, toY: n.y * 16,
    stepParity: 0,
    wanderCooldown: rng.int(90, 240),
  }));

  // 拾ったものはフラグで消える。同じものを何度も拾えないようにするため。
  world.items = (map.items ?? []).filter((it) => !getFlag(it.flag)).filter(isVisible);

  // ぬしポケモン。倒す/つかまえると flag が立って消える。にげられたら残る。
  // 殿堂入り後は postgameLv があればそちらを使う（Q-4）。flag 自体は
  // 殿堂入りのたびに HallOfFameScene 側でクリアして復活させる。
  const postgame = getFlag('hallOfFame');
  world.statics = (map.statics ?? [])
    .filter((s) => !getFlag(s.flag))
    .filter(isVisible)
    .map((s) => ({ ...s, tx: s.x, ty: s.y, lv: (postgame && s.postgameLv) ? s.postgameLv : s.lv }));

  state.player.pos = { map: mapId, x: tx, y: ty, dir };
  // 一度でも行った町は「そらをとぶ」の行き先になる
  if (map.fly) setFlag(`been_${mapId}`);
  // 最後に入ったポケモンセンターを覚える。全滅したらここへ戻る。
  if (map.respawn) state.player.respawn = { map: mapId, ...map.respawn };
  state.stepsSinceEncounter = 0;
  return map;
}

/**
 * 時間帯。実時間の時計をそのまま使う。
 * ゲーム内時間を別に持つと、セーブ・ロードのたびにズレて説明がつかなくなる。
 */
export function timeOfDay(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'evening';
  return 'night';
}

/** 屋外だけ、時間帯に応じた色をかぶせる。屋内と洞窟は変えない。 */
export const TINT = {
  morning: 'rgba(255, 200, 140, 0.10)',
  day: null,
  evening: 'rgba(255, 140, 60, 0.18)',
  night: 'rgba(30, 40, 110, 0.34)',
};

export const width = () => mapWidth(world.map);
export const height = () => mapHeight(world.map);
export const tileAt = (x, y) => tileKeyAt(world.map, x, y);

/** そのタイルに立てるか */
export function isWalkable(x, y, { ignoreNpc = false, surfing = world.surfing } = {}) {
  const key = tileAt(x, y);
  if (!key) return false;
  const t = TILE[key];
  if (t?.solid) return false;
  if (t?.ledge) return false;          // 段差は tryStep が別あつかいで通す
  if (t?.water && !surfing) return false;     // 水の上に出られるのは なみのり中だけ
  if (world.items.some((it) => it.x === x && it.y === y)) return false;
  if (world.statics.some((s) => s.tx === x && s.ty === y)) return false;
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

    const boss = world.statics.find((s) => s.tx === x && s.ty === y);
    if (boss) return { type: 'static', boss };

    const item = world.items.find((it) => it.x === x && it.y === y);
    if (item) return { type: 'item', item };

    const sign = (world.map.signs ?? []).find((s) => s.x === x && s.y === y);
    if (sign) return { type: 'sign', sign };

    const key = tileAt(x, y);
    if (step === 1) {
      if (TILE[key]?.pc) return { type: 'pc' };
      if (TILE[key]?.heal) return { type: 'bed' };
      // 岸から水を向いているとき。なみのり・つりの入口になる。
      if (TILE[key]?.water && !world.surfing) return { type: 'water' };
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

  // 段差：向きが合っていれば、その1マス先へ飛び降りる
  const ledge = TILE[tileAt(nx, ny)]?.ledge;
  if (ledge) {
    if (ledge !== dir) return false;
    const lx = nx + d.dx;
    const ly = ny + d.dy;
    if (!isWalkable(lx, ly)) return false;
    startMove(p, lx, ly, JUMP_FRAMES);
    p.jumping = true;
    return true;
  }

  if (!isWalkable(nx, ny)) return false;

  startMove(p, nx, ny, running ? RUN_FRAMES : WALK_FRAMES);
  return true;
}

function startMove(p, nx, ny, frames) {
  p.moving = true;
  p.t = 0;
  p.frames = frames;
  p.fromX = p.tx * 16; p.fromY = p.ty * 16;
  p.toX = nx * 16; p.toY = ny * 16;
  p.tx = nx; p.ty = ny;
}

/** なみのりを始める。目の前の水へ1歩ふみだす。 */
export function startSurf() {
  const p = world.player;
  const d = DIRS[p.dir];
  if (!TILE[tileAt(p.tx + d.dx, p.ty + d.dy)]?.water) return false;
  world.surfing = true;
  return tryStep(p.dir);
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
  // 飛び降り中は放物線ぶんだけ浮かせる（描画側が hopY を引く）
  p.hopY = p.jumping ? Math.sin(r * Math.PI) * 12 : 0;

  if (p.t < p.frames) return null;

  // 到達
  p.moving = false;
  p.jumping = false;
  p.hopY = 0;
  p.px = p.toX;
  p.py = p.toY;
  p.stepParity ^= 1;
  state.player.pos.x = p.tx;
  state.player.pos.y = p.ty;

  const tile = tileAt(p.tx, p.ty);
  // 陸に上がったら なみのり終了
  if (world.surfing && !TILE[tile]?.water) world.surfing = false;
  const warp = (world.map.warps ?? [])
    .filter(isVisible)
    .find((w) => w.x === p.tx && w.y === p.ty) ?? null;
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
    // NPC は なみのりできない。プレイヤーが水上にいても陸だけを歩く。
    if (far || !isWalkable(nx, ny, { surfing: false })) {
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

// ---- トレーナーの視線 ----

/**
 * 向いている方向にプレイヤーがいるトレーナーを探す。
 * 手前に壁や他の NPC があれば視線はそこで止まる。
 * 一度倒した相手（フラグ持ち）は二度と仕掛けてこない。
 */
export function trainerInSight() {
  const p = world.player;
  if (p.moving) return null;

  for (const n of world.npcs) {
    // フラグは TRAINERS のキーで持つ。NPC の id ではなく、
    // 「誰に勝ったか」で覚えるほうが、同じ人物を別マップに出しても壊れない。
    if (!n.trainer || getFlag(trainerFlag(n.trainer))) continue;
    const range = n.sight ?? getTrainer(n.trainer)?.sight ?? 0;
    if (range <= 0) continue;

    const d = DIRS[n.dir];
    for (let i = 1; i <= range; i++) {
      const x = n.tx + d.dx * i;
      const y = n.ty + d.dy * i;

      const key = tileAt(x, y);
      if (!key || TILE[key]?.solid) break;                     // 壁の向こうは見えない
      if (world.npcs.some((o) => o !== n && o.tx === x && o.ty === y)) break;

      if (p.tx === x && p.ty === y) return { npc: n, distance: i };
    }
  }
  return null;
}

/**
 * トレーナーをプレイヤーの手前まで1マス近づける。
 * まだ歩く余地があれば true、もう隣なら false。
 */
export function stepNpcTowardPlayer(npc) {
  const p = world.player;
  const d = DIRS[npc.dir];
  const nx = npc.tx + d.dx;
  const ny = npc.ty + d.dy;
  if (nx === p.tx && ny === p.ty) return false;                // もう目の前

  npc.moving = true;
  npc.t = 0;
  npc.fromX = npc.tx * 16; npc.fromY = npc.ty * 16;
  npc.toX = nx * 16; npc.toY = ny * 16;
  npc.tx = nx; npc.ty = ny;
  return true;
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
