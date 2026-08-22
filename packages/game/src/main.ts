/**
 * v0.10 の入口。
 *
 * **v0.9 まではモードタブだった。** 画面上部に「ぼうけん／トーナメント／
 * バトルしせつ／ネームド／フリーバトル／セーブ」が並んでいて、
 * どれを押しても別の画面になる ―― ゲームというより機能の一覧だった。
 *
 * v0.10 でタブを捨て、**拠点マップ**に置き換えた。
 * 施設もトーナメントも共通ボックスも、歩いて建物に入って受付に話しかける。
 * 地方へもゲートから入る（ui-flow.md §3 のホーム画面を、場所として実装した）。
 *
 * そのため、ここに残るのは3つだけになった。
 *   1. 起動してセーブを読む
 *   2. マップ画面を作る（居場所が変わったら作り直す）
 *   3. **セーブ／設定への常設の出口**
 *
 * 3 を残すのは安全弁。マップが壊れた版を掴んだとき、
 * **バックアップに辿り着けなくなるのがいちばん困る**（エクスポートが唯一の保険）。
 */

import { allMoves, allNamed, allSpecies } from "@pkmn/data";
import { $, setSpeed, type Speed } from "./battle-screen.js";
import { playField, type FieldHandle } from "./field.js";
import { loadPlayer, save, setSave, useStore, SLOT } from "./player.js";
import { createLocalSaveStore } from "./save.js";
import { useArtMode } from "./art/source.js";
import { loadArt } from "./art/store.js";
import { settingsScreen } from "./settings.js";

const store = createLocalSaveStore();
useStore(store);

// ─────────────────────────────────────────────
// 画面の骨組み
// ─────────────────────────────────────────────

$("#app").innerHTML = `
  <header>
    <h1>ポケモン風RPG <span class="ver">v0.12-c</span></h1>
    <div class="tools">
      <div class="speed" id="speed">
        <button data-s="normal" class="on">つうじょう</button>
        <button data-s="fast">こうそく</button>
        <button data-s="logOnly">ログのみ</button>
      </div>
      <button id="open-settings" class="pad-menu">セーブ</button>
    </div>
  </header>
  <main>
    <section id="run" class="hidden"></section>
    <!-- 画面の出口。#menu の外に置く（理由は下のコメント） -->
    <button id="screen-back" class="back hidden"></button>
    <section id="menu" class="hidden"></section>
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

// v0.11 でカントーの外の種が入った。**「カントー190種」は嘘になる**ので、
// 図鑑番号で内訳を出す（151番までがカントー）
const kanto = allSpecies.filter((s) => s.dexNo <= 151).length;
$("#scale").textContent =
  `ポケモン ${allSpecies.length} 種（カントー ${kanto} ＋ ${allSpecies.length - kanto}）`
  + ` ・ 技 ${allMoves.length} 種 ・ ネームド ${allNamed.length} 人`;

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
// マップ画面
// ─────────────────────────────────────────────

/**
 * 画面の出口（`#screen-back`）を **`#menu` の外**に置いてある理由。
 *
 * 中に置いたら、画面が描き直されるたびに消えた ――
 * **BP交換所で1つ買った瞬間に出口が消え、拠点へ戻れなくなった。**
 * タブがあった頃は、どこで詰まっても別のタブへ逃げられた。今は逃げ道がここだけなので、
 * 描き直しに巻き込まれない場所に置く（screens.ts の `openScreen` が付け外しする）。
 */

/** マップ探索はキーボードを掴むので、作り直す前に必ず解放する。 */
let field: FieldHandle | null = null;

/**
 * マップ画面を作り直す。
 *
 * 地方へ入る／拠点へ戻ると**居場所ごと変わる**（位置・手持ち・フラグが一斉に入れ替わる）。
 * 途中から書き換えるより作り直す方が安全なので、`field.ts` から呼んでもらう。
 */
function showField(): void {
  field?.stop();
  field = null;
  $("#menu").classList.add("hidden");
  field = playField(showField);
}

$("#open-settings").onclick = () => {
  field?.stop();
  field = null;
  // 設定画面を閉じたら、そのときの居場所でマップを作り直す
  settingsScreen(showField);
};

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

  // 手元の素材を使う設定なら読み込む。**読めなくても先へ進む** ――
  // 素材が無い状態は逃げ道ではなく通常動作（art/source.ts）
  if (save.settings.artSource === "local") {
    useArtMode("local");
    try {
      await loadArt();
    } catch (error) {
      console.warn("そざいを よみこめませんでした", error);
    }
  }

  showField();
})();
