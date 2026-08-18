/**
 * v0.6 の入口。
 *
 * 遊び方を切り替えるだけの薄い層。
 *   トーナメント … v0.6。歴代ネームドと戦う勝ち抜き。「誰と戦うか」が主役
 *   バトル施設   … v0.5 の連戦。「どう戦うか」が主役
 *   ネームド     … 収録済みのキャラ一覧
 *   フリーバトル … v0.3 からある、ランダムな3体どうしの1戦
 *
 * 設計: docs/design/ui-flow.md / docs/design/endgame.md
 */

import { createRng, emptySave, type BattlePokemonSource, type SaveData } from "@pkmn/core";
import { allFacilities, allMoves, allNamed, allSpecies, allTournaments } from "@pkmn/data";
import { $, runBattle, setSpeed, waitForButton, type Speed } from "./battle-screen.js";
import { cupMenu, namedList, playCup } from "./cup.js";
import { createLocalSaveStore } from "./save.js";
import { facilityMenu, playFacility } from "./tower.js";

const LEVEL = 50;
const TEAM_SIZE = 3;

const store = createLocalSaveStore();
let save: SaveData = emptySave();

// ─────────────────────────────────────────────
// 画面の骨組み
// ─────────────────────────────────────────────

$("#app").innerHTML = `
  <header>
    <h1>ポケモン風RPG <span class="ver">v0.6</span></h1>
    <div class="tools">
      <div class="speed" id="speed">
        <button data-s="normal" class="on">つうじょう</button>
        <button data-s="fast">こうそく</button>
        <button data-s="logOnly">ログのみ</button>
      </div>
    </div>
  </header>
  <nav id="modes">
    <button data-m="cup" class="on">トーナメント</button>
    <button data-m="facility">バトル しせつ</button>
    <button data-m="named">ネームド</button>
    <button data-m="free">フリーバトル</button>
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

type Mode = "cup" | "facility" | "named" | "free";
let mode: Mode = "cup";

const context = () => ({
  save,
  store,
  onSaveChanged: (next: SaveData) => {
    save = next;
  },
});

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
  mode = next;
  if (next === "cup") showCupMenu();
  else if (next === "facility") showFacilityMenu();
  else if (next === "named") {
    $("#run").classList.add("hidden");
    namedList();
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
  const loaded = await store.load(0);
  if (loaded !== null) save = loaded;
  show("cup");
})();
