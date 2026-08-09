"use strict";

/* ---------- 定数 ---------- */
const TILE = 32;
const MAP_W = 15;
const MAP_H = 11;

// タイル種類: 0=草地(道) 1=木(進入不可) 2=茂み(エンカウント) 3=水(進入不可) 4=道
const TILE_GRASS = 0;
const TILE_TREE = 1;
const TILE_BUSH = 2;
const TILE_WATER = 3;
const TILE_PATH = 4;

const TILE_COLORS = {
  [TILE_GRASS]: "#3a8a3a",
  [TILE_TREE]: "#1f5c1f",
  [TILE_BUSH]: "#2e6b2e",
  [TILE_WATER]: "#2d6fbf",
  [TILE_PATH]: "#c9b27c",
};

// prettier-ignore
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,4,4,4,0,0,0,0,0,0,0,4,4,4,1],
  [1,4,1,4,0,2,2,2,2,2,0,4,1,4,1],
  [1,4,1,4,0,2,2,2,2,2,0,4,1,4,1],
  [1,4,4,4,0,2,2,2,2,2,0,4,4,4,1],
  [1,4,3,4,0,0,0,4,0,0,0,4,3,4,1],
  [1,4,3,4,4,4,4,4,4,4,4,4,3,4,1],
  [1,4,4,4,0,2,2,2,2,2,0,4,4,4,1],
  [1,4,1,4,0,2,2,2,2,2,0,4,1,4,1],
  [1,4,1,4,0,0,0,0,0,0,0,4,1,4,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const ENCOUNTER_RATE = 0.15; // 茂みでの遭遇率(1歩ごと)

/* ---------- モンスターデータ ---------- */
const STARTERS = [
  { id: "fire", name: "ヒノコ", type: "ほのお", icon: "🔥", hp: 22, atk: 7, def: 4,
    moves: [{ name: "ひのこ", power: 9, acc: 0.95 }, { name: "たいあたり", power: 6, acc: 1.0 }] },
  { id: "water", name: "ミズッコ", type: "みず", icon: "💧", hp: 24, atk: 6, def: 5,
    moves: [{ name: "みずでっぽう", power: 8, acc: 0.95 }, { name: "たいあたり", power: 6, acc: 1.0 }] },
  { id: "grass", name: "クサモグラ", type: "くさ", icon: "🌿", hp: 23, atk: 6, def: 6,
    moves: [{ name: "はっぱカッター", power: 8, acc: 0.95 }, { name: "たいあたり", power: 6, acc: 1.0 }] },
];

const WILD_SPECIES = [
  { name: "ノズラット", icon: "🐭", hp: 14, atk: 5, def: 3,
    moves: [{ name: "かみつく", power: 6, acc: 0.9 }, { name: "たいあたり", power: 5, acc: 1.0 }] },
  { name: "ハネムシ", icon: "🐛", hp: 12, atk: 4, def: 3,
    moves: [{ name: "むしくい", power: 5, acc: 0.9 }, { name: "たいあたり", power: 4, acc: 1.0 }] },
  { name: "イワゴロ", icon: "🪨", hp: 18, atk: 5, def: 7,
    moves: [{ name: "ころがる", power: 7, acc: 0.85 }, { name: "たいあたり", power: 5, acc: 1.0 }] },
  { name: "ピヨコ", icon: "🐤", hp: 13, atk: 6, def: 2,
    moves: [{ name: "つつく", power: 6, acc: 0.95 }, { name: "たいあたり", power: 4, acc: 1.0 }] },
];

/* ---------- 状態 ---------- */
const state = {
  screen: "title", // title | map | battle
  player: {
    tileX: 7, tileY: 5,
    pixelX: 7 * TILE, pixelY: 5 * TILE,
    dir: "down",
    moving: false,
  },
  mon: null, // { name, icon, level, exp, maxHp, hp, atk, def, moves }
  battle: null,
};

/* ---------- 初期化 ---------- */
const titleScreenEl = document.getElementById("title-screen");
const mapScreenEl = document.getElementById("map-screen");
const battleScreenEl = document.getElementById("battle-screen");
const starterOptionsEl = document.getElementById("starter-options");
const mapStatusEl = document.getElementById("map-status");
const mapCanvas = document.getElementById("map-canvas");
const mapCtx = mapCanvas.getContext("2d");
const battleCanvas = document.getElementById("battle-canvas");
const battleCtx = battleCanvas.getContext("2d");
const battleLogEl = document.getElementById("battle-log");
const battleMainActionsEl = document.getElementById("battle-main-actions");
const battleMoveActionsEl = document.getElementById("battle-move-actions");

function buildStarterOptions() {
  STARTERS.forEach((sp) => {
    const card = document.createElement("div");
    card.className = "starter-card";
    card.innerHTML = `
      <div class="icon">${sp.icon}</div>
      <div class="name">${sp.name}</div>
      <div class="type">${sp.type}タイプ</div>
    `;
    card.addEventListener("click", () => chooseStarter(sp));
    starterOptionsEl.appendChild(card);
  });
}

function chooseStarter(sp) {
  state.mon = {
    name: sp.name,
    icon: sp.icon,
    level: 5,
    exp: 0,
    maxHp: sp.hp,
    hp: sp.hp,
    atk: sp.atk,
    def: sp.def,
    moves: sp.moves,
  };
  showScreen("map");
}

function showScreen(name) {
  state.screen = name;
  titleScreenEl.classList.toggle("hidden", name !== "title");
  mapScreenEl.classList.toggle("hidden", name !== "map");
  battleScreenEl.classList.toggle("hidden", name !== "battle");
  if (name === "map") updateMapStatus();
}

function updateMapStatus() {
  mapStatusEl.textContent = `${state.mon.name} Lv${state.mon.level}  HP ${state.mon.hp}/${state.mon.maxHp}`;
}

/* ---------- マップ描画 ---------- */
function drawMap() {
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      mapCtx.fillStyle = TILE_COLORS[MAP[y][x]];
      mapCtx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (MAP[y][x] === TILE_TREE) {
        mapCtx.fillStyle = "#123312";
        mapCtx.beginPath();
        mapCtx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, TILE / 2 - 4, 0, Math.PI * 2);
        mapCtx.fill();
      }
    }
  }
  // プレイヤー
  const p = state.player;
  mapCtx.fillStyle = "#ffe08a";
  mapCtx.fillRect(p.pixelX + 6, p.pixelY + 4, TILE - 12, TILE - 8);
  mapCtx.fillStyle = "#7a4b12";
  const eyeOffsets = {
    down: [[10, 12], [18, 12]],
    up: [[10, 6], [18, 6]],
    left: [[8, 12]],
    right: [[20, 12]],
  }[p.dir];
  eyeOffsets.forEach(([ox, oy]) => {
    mapCtx.fillRect(p.pixelX + ox, p.pixelY + oy, 3, 3);
  });
}

/* ---------- 移動 ---------- */
const MOVE_SPEED = 4; // px/frame

function isWalkable(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  const t = MAP[ty][tx];
  return t !== TILE_TREE && t !== TILE_WATER;
}

function tryMove(dx, dy, dir) {
  const p = state.player;
  p.dir = dir;
  if (p.moving || state.screen !== "map") return;
  const tx = p.tileX + dx;
  const ty = p.tileY + dy;
  if (!isWalkable(tx, ty)) return;
  p.moving = true;
  p.targetTileX = tx;
  p.targetTileY = ty;
}

function updatePlayer() {
  const p = state.player;
  if (!p.moving) return;
  const targetPx = p.targetTileX * TILE;
  const targetPy = p.targetTileY * TILE;
  if (p.pixelX < targetPx) p.pixelX = Math.min(p.pixelX + MOVE_SPEED, targetPx);
  if (p.pixelX > targetPx) p.pixelX = Math.max(p.pixelX - MOVE_SPEED, targetPx);
  if (p.pixelY < targetPy) p.pixelY = Math.min(p.pixelY + MOVE_SPEED, targetPy);
  if (p.pixelY > targetPy) p.pixelY = Math.max(p.pixelY - MOVE_SPEED, targetPy);

  if (p.pixelX === targetPx && p.pixelY === targetPy) {
    p.tileX = p.targetTileX;
    p.tileY = p.targetTileY;
    p.moving = false;
    onArriveTile();
  }
}

function onArriveTile() {
  const p = state.player;
  if (MAP[p.tileY][p.tileX] === TILE_BUSH && Math.random() < ENCOUNTER_RATE) {
    startBattle();
  }
}

/* ---------- 入力 ---------- */
const KEY_DIR = {
  ArrowUp: [0, -1, "up"], w: [0, -1, "up"], W: [0, -1, "up"],
  ArrowDown: [0, 1, "down"], s: [0, 1, "down"], S: [0, 1, "down"],
  ArrowLeft: [-1, 0, "left"], a: [-1, 0, "left"], A: [-1, 0, "left"],
  ArrowRight: [1, 0, "right"], d: [1, 0, "right"], D: [1, 0, "right"],
};

window.addEventListener("keydown", (e) => {
  const mapping = KEY_DIR[e.key];
  if (mapping && state.screen === "map") {
    e.preventDefault();
    tryMove(mapping[0], mapping[1], mapping[2]);
  }
});

/* ---------- バトル ---------- */
function randomWildMon() {
  const sp = WILD_SPECIES[Math.floor(Math.random() * WILD_SPECIES.length)];
  const level = 2 + Math.floor(Math.random() * 4); // 2-5
  const scale = 1 + (level - 1) * 0.15;
  return {
    name: sp.name,
    icon: sp.icon,
    level,
    maxHp: Math.round(sp.hp * scale),
    hp: Math.round(sp.hp * scale),
    atk: Math.round(sp.atk * scale),
    def: Math.round(sp.def * scale),
    moves: sp.moves,
  };
}

function startBattle() {
  state.battle = {
    wild: randomWildMon(),
    turn: "player",
    over: false,
  };
  showScreen("battle");
  log(`野生の ${state.battle.wild.name} が現れた！`, true);
  showMainActions();
  drawBattle();
}

function log(text, replace) {
  battleLogEl.textContent = replace ? text : battleLogEl.textContent + "\n" + text;
}

function showMainActions() {
  battleMainActionsEl.classList.remove("hidden");
  battleMoveActionsEl.classList.add("hidden");
  battleMoveActionsEl.innerHTML = "";
}

function showMoveActions() {
  battleMainActionsEl.classList.add("hidden");
  battleMoveActionsEl.classList.remove("hidden");
  battleMoveActionsEl.innerHTML = "";
  state.mon.moves.forEach((mv, i) => {
    const btn = document.createElement("button");
    btn.textContent = mv.name;
    btn.addEventListener("click", () => playerAttack(i));
    battleMoveActionsEl.appendChild(btn);
  });
  const back = document.createElement("button");
  back.textContent = "もどる";
  back.addEventListener("click", showMainActions);
  battleMoveActionsEl.appendChild(back);
}

document.getElementById("battle-main-actions").addEventListener("click", (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === "fight") showMoveActions();
  if (action === "run") tryRun();
});

function computeDamage(attacker, defender, move) {
  const raw = move.power + attacker.atk - defender.def / 2 + (Math.random() * 3 - 1);
  return Math.max(1, Math.round(raw));
}

function playerAttack(moveIndex) {
  if (state.battle.over) return;
  const b = state.battle;
  const move = state.mon.moves[moveIndex];
  battleMainActionsEl.classList.add("hidden");
  battleMoveActionsEl.classList.add("hidden");

  if (Math.random() > move.acc) {
    log(`${state.mon.name} の ${move.name}！ しかし外れた！`);
  } else {
    const dmg = computeDamage(state.mon, b.wild, move);
    b.wild.hp = Math.max(0, b.wild.hp - dmg);
    log(`${state.mon.name} の ${move.name}！ ${b.wild.name} に ${dmg} のダメージ！`);
  }
  drawBattle();

  if (b.wild.hp <= 0) {
    winBattle();
    return;
  }
  setTimeout(enemyAttack, 900);
}

function enemyAttack() {
  const b = state.battle;
  if (b.over) return;
  const move = b.wild.moves[Math.floor(Math.random() * b.wild.moves.length)];
  if (Math.random() > move.acc) {
    log(`${b.wild.name} の ${move.name}！ しかし外れた！`);
  } else {
    const dmg = computeDamage(b.wild, state.mon, move);
    state.mon.hp = Math.max(0, state.mon.hp - dmg);
    log(`${b.wild.name} の ${move.name}！ ${state.mon.name} は ${dmg} のダメージを受けた！`);
  }
  drawBattle();

  if (state.mon.hp <= 0) {
    loseBattle();
    return;
  }
  showMainActions();
}

function tryRun() {
  const b = state.battle;
  if (Math.random() < 0.7) {
    log("うまく逃げ切った！", true);
    b.over = true;
    setTimeout(() => showScreen("map"), 800);
  } else {
    log("しかし逃げられなかった！");
    setTimeout(enemyAttack, 800);
  }
}

function winBattle() {
  const b = state.battle;
  b.over = true;
  const gainedExp = b.wild.level * 3 + 5;
  state.mon.exp += gainedExp;
  log(`${b.wild.name} を たおした！\n${gainedExp} けいけんちを かくとく！`);

  const needed = state.mon.level * 10;
  if (state.mon.exp >= needed) {
    state.mon.exp -= needed;
    state.mon.level += 1;
    state.mon.maxHp += 4;
    state.mon.atk += 2;
    state.mon.def += 1;
    state.mon.hp = state.mon.maxHp;
    log(`${state.mon.name} は レベル${state.mon.level} に あがった！`);
  }
  setTimeout(() => showScreen("map"), 1400);
}

function loseBattle() {
  const b = state.battle;
  b.over = true;
  log(`${state.mon.name} は たおれた……\n目の前が真っ暗になった。`);
  setTimeout(() => {
    state.mon.hp = state.mon.maxHp;
    showScreen("map");
  }, 1600);
}

/* ---------- バトル描画 ---------- */
function drawBattle() {
  battleCtx.clearRect(0, 0, battleCanvas.width, battleCanvas.height);
  battleCtx.fillStyle = "#4a7a3a";
  battleCtx.fillRect(0, 0, battleCanvas.width, battleCanvas.height);

  const b = state.battle;
  if (!b) return;

  drawMonPanel(b.wild, 20, 15, false);
  drawMonPanel(state.mon, 240, 120, true);

  battleCtx.font = "36px serif";
  battleCtx.fillText(b.wild.icon, 340, 90);
  battleCtx.fillText(state.mon.icon, 90, 190);
}

function drawMonPanel(mon, x, y, isPlayer) {
  battleCtx.fillStyle = "#f5f0dc";
  battleCtx.fillRect(x, y, 200, 46);
  battleCtx.strokeStyle = "#332";
  battleCtx.strokeRect(x, y, 200, 46);
  battleCtx.fillStyle = "#222";
  battleCtx.font = "13px sans-serif";
  battleCtx.fillText(`${mon.name} Lv${mon.level}`, x + 8, y + 16);

  const barW = 160;
  const pct = Math.max(0, mon.hp / mon.maxHp);
  battleCtx.fillStyle = "#555";
  battleCtx.fillRect(x + 8, y + 24, barW, 8);
  battleCtx.fillStyle = pct > 0.5 ? "#3ac23a" : pct > 0.2 ? "#e0c020" : "#d03030";
  battleCtx.fillRect(x + 8, y + 24, barW * pct, 8);
  battleCtx.fillStyle = "#222";
  battleCtx.fillText(`${mon.hp}/${mon.maxHp}`, x + 8, y + 42);
}

/* ---------- メインループ ---------- */
function loop() {
  if (state.screen === "map") {
    updatePlayer();
    drawMap();
  }
  requestAnimationFrame(loop);
}

buildStarterOptions();
requestAnimationFrame(loop);
