/**
 * v0.9 の入口。
 *
 * 遊び方を切り替えるだけの薄い層。
 *   ぼうけん     … v0.7。マップを歩く。原作の遊び方の入口
 *   トーナメント … v0.6。歴代ネームドと戦う勝ち抜き。「誰と戦うか」が主役
 *   バトル施設   … v0.5 の連戦。「どう戦うか」が主役
 *   ネームド     … 収録済みのキャラ一覧
 *   フリーバトル … v0.3 からある、ランダムな3体どうしの1戦
 *   セーブ       … v0.9。保存の状態・設定・バックアップ
 *
 * セーブの実体は `player.ts` が1つだけ持つ。ここは起動時に読み込み、
 * 施設とトーナメントに渡すだけ ―― **同じセーブを2箇所が別々に持つと、
 * 後から書いた方が相手の記録を消す。**
 *
 * 設計: docs/design/ui-flow.md / docs/design/endgame.md
 */

import { createRng, type BattlePokemonSource, type SaveData } from "@pkmn/core";
import { allFacilities, allMoves, allNamed, allSpecies, allTournaments } from "@pkmn/data";
import { $, runBattle, setSpeed, waitForButton, type Speed } from "./battle-screen.js";
import { cupMenu, namedList, playCup } from "./cup.js";
import { playField, type FieldHandle } from "./field.js";
import { loadPlayer, save, setSave, useStore, SLOT } from "./player.js";
import { createLocalSaveStore } from "./save.js";
import { settingsScreen } from "./settings.js";
import { facilityMenu, playFacility } from "./tower.js";

const LEVEL = 50;
const TEAM_SIZE = 3;

const store = createLocalSaveStore();
useStore(store);

// ─────────────────────────────────────────────
// 画面の骨組み
// ─────────────────────────────────────────────

$("#app").innerHTML = `
  <header>
    <h1>ポケモン風RPG <span class="ver">v0.9</span></h1>
    <div class="tools">
      <div class="speed" id="speed">
        <button data-s="normal" class="on">つうじょう</button>
        <button data-s="fast">こうそく</button>
        <button data-s="logOnly">ログのみ</button>
      </div>
    </div>
  </header>
  <nav id="modes">
    <button data-m="field" class="on">ぼうけん</button>
    <button data-m="cup">トーナメント</button>
    <button data-m="facility">バトル しせつ</button>
    <button data-m="named">ネームド</button>
    <button data-m="free">フリーバトル</button>
    <button data-m="save">セーブ</button>
  </nav>
  <main>
    <section id="run" class="hidden"></section>
    <section id="menu"></section>
    <div id="battle" class="hidden">
      <section id="field"></section>
      <section id="log"></section>
      <p id="prompt"></p>
      <section id="controls"></section>
    </div>
  </main>
  <footer>
    <span id="scale"></span><br />
    シードが おなじなら まったく おなじ しょうぶに なります（設計: シード固定の疑似乱数）
  </footer>`;

$("#scale").textContent =
  `カントー ${allSpecies.length} 種 ・ 技 ${allMoves.length} 種 ・ ネームド ${allNamed.length} 人`;

$("#speed").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const value = target.dataset["s"] as Speed | undefined;
  if (value === undefined) return;
  setSpeed(value);
  // 設定はセーブに載る。ここで書かないと、設定画面と表示が食い違う
  setSave({ ...save, settings: { ...save.settings, battleSpeed: value } });
  for (const b of $("#speed").querySelectorAll("button")) b.classList.toggle("on", b === target);
});

// ─────────────────────────────────────────────
// フリーバトル（v0.3 からの遊び方）
// ─────────────────────────────────────────────

function randomTeam(seed: number, offset: number): BattlePokemonSource[] {
  const rng = createRng({ s: (seed + offset * 7919) >>> 0 || 1, calls: 0 });
  const pool = [...allSpecies];
  const team: BattlePokemonSource[] = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const species = pool.splice(rng.int(pool.length), 1)[0]!;
    const moves = species.learnset
      .filter((l) => l.level <= LEVEL)
      .map((l) => l.move)
      .slice(-4);
    team.push({ species: species.id, level: LEVEL, moves });
  }
  return team;
}

async function freeBattle(): Promise<void> {
  $("#menu").classList.add("hidden");
  $("#run").classList.add("hidden");
  let seed = 1;
  while (mode === "free") {
    await runBattle({
      parties: [randomTeam(seed, 1), randomTeam(seed, 2)],
      seed,
      ai: "random",
      headline: `しょうぶ かいし! (seed ${seed})`,
    });
    await waitForButton("もう いちど");
    seed = Math.floor(Math.random() * 1_000_000);
  }
}

// ─────────────────────────────────────────────
// モード切り替え
// ─────────────────────────────────────────────

type Mode = "field" | "cup" | "facility" | "named" | "free" | "save";
let mode: Mode = "field";

/** マップ探索はキーボードを掴むので、モードを離れるときに必ず解放する。 */
let field: FieldHandle | null = null;

const context = () => ({ save, store, onSaveChanged: (next: SaveData) => setSave(next) });

const seed = () => Math.floor(Math.random() * 1_000_000);

function showFacilityMenu(): void {
  $("#run").classList.add("hidden");
  facilityMenu(allFacilities, save, (facility) => {
    void playFacility(facility, context(), seed()).then(() => {
      if (mode === "facility") showFacilityMenu();
    });
  });
}

function showCupMenu(): void {
  $("#run").classList.add("hidden");
  cupMenu(allTournaments, save, (cup, tier) => {
    void playCup(cup, tier, context(), seed()).then(() => {
      if (mode === "cup") showCupMenu();
    });
  });
}

function show(next: Mode): void {
  field?.stop();
  field = null;
  mode = next;
  if (next === "field") {
    $("#menu").classList.add("hidden");
    field = playField();
  } else if (next === "cup") showCupMenu();
  else if (next === "facility") showFacilityMenu();
  else if (next === "named") {
    $("#run").classList.add("hidden");
    namedList();
  } else if (next === "save") {
    // マップ画面はモードを離れるたびに捨てている（`field = null`）ので、
    // ここでセーブを読み込み直しても、「ぼうけん」に戻った時点で作り直される
    settingsScreen();
  } else void freeBattle();
}

$("#modes").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const value = target.dataset["m"] as Mode | undefined;
  if (value === undefined || value === mode) return;
  for (const b of $("#modes").querySelectorAll("button")) b.classList.toggle("on", b === target);
  show(value);
});

// ─────────────────────────────────────────────
// 起動
// ─────────────────────────────────────────────

void (async () => {
  const loaded = await store.load(SLOT);
  // 読めなくても遊べる。**黙って新規データを作る**のはここだけ（他は null を返す）
  if (loaded !== null) loadPlayer(loaded);
  setSpeed(save.settings.battleSpeed);
  for (const b of $("#speed").querySelectorAll("button")) {
    b.classList.toggle("on", b.dataset["s"] === save.settings.battleSpeed);
  }
  show("field");
})();
