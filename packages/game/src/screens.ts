/**
 * 拠点から開く画面（v0.10）。
 *
 * v0.9 まで、施設とトーナメントは**画面上部のタブ**だった。
 * v0.10 で拠点マップができ、どちらも**建物に入って受付に話しかける**形になった
 * （ui-flow.md §3 のホーム画面を、メニューではなく場所として実装した）。
 *
 * そのため、開いた画面は**必ず閉じてマップへ戻る**必要がある。
 * ここでは「開いてから閉じるまで」を Promise 1本にして、
 * イベント側（`field.ts`）が `await` するだけで済む形にしてある。
 */

import { createRng, type BattlePokemonSource, type SaveData } from "@pkmn/core";
import { allFacilities, allSpecies, allTournaments } from "@pkmn/data";
import { $, runBattle, waitForButton } from "./battle-screen.js";
import { cupMenu, playCup } from "./cup.js";
import { save, saveStore, setSave } from "./player.js";
import { facilityMenu, playFacility } from "./tower.js";

const seed = () => Math.floor(Math.random() * 1_000_000);

const context = () => ({
  save,
  store: saveStore(),
  onSaveChanged: (next: SaveData) => setSave(next),
});

/**
 * 画面を開き、「もどる」が押されるまで待つ。
 *
 * 出口のボタンは `#menu` の**外**にある（main.ts）。
 * 中に置いていたときは、画面を描き直すたびに消えていた ――
 * BP交換所で1つ買った瞬間に拠点へ戻れなくなる、という形で出た。
 * **タブを消した以上、逃げ道はここだけ**なので、描き直しに巻き込まれない場所に置く。
 */
function openScreen(label: string, render: (close: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    $("#run").classList.add("hidden");
    const back = $("#screen-back");
    back.textContent = `← ${label}`;
    back.classList.remove("hidden");

    const close = (): void => {
      back.classList.add("hidden");
      back.onclick = null;
      $("#menu").classList.add("hidden");
      $("#run").classList.remove("hidden");
      resolve();
    };
    back.onclick = close;
    render(close);
  });
}

/** バトル施設（`openFacility`）。 */
export function openFacilityScreen(): Promise<void> {
  return openScreen("きょてんへ", () => {
    const show = (): void => {
      facilityMenu(allFacilities, save, (facility) => {
        void playFacility(facility, context(), seed()).then(show);
      });
    };
    show();
  });
}

/** トーナメント（`openTournament`）。 */
export function openTournamentScreen(): Promise<void> {
  return openScreen("きょてんへ", () => {
    const show = (): void => {
      cupMenu(allTournaments, save, (cup, tier) => {
        void playCup(cup, tier, context(), seed()).then(show);
      });
    };
    show();
  });
}

// ─────────────────────────────────────────────
// フリーバトル（v0.3 からある開発用の遊び方）
// ─────────────────────────────────────────────

const LEVEL = 50;
const TEAM_SIZE = 3;

function randomTeam(base: number, offset: number): BattlePokemonSource[] {
  const rng = createRng({ s: (base + offset * 7919) >>> 0 || 1, calls: 0 });
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

/**
 * ランダムな3体どうしの1戦。
 *
 * v0.3 からある最古の遊び方で、**エンジンだけを試せる唯一の入口**。
 * タブを消したので拠点の隅（てあわせ相手）に置いた ――
 * 消さないのは、手持ちが無くてもバトルを確認できる場所が要るため。
 */
export async function openFreeBattle(): Promise<void> {
  $("#run").classList.add("hidden");
  $("#menu").classList.add("hidden");
  let s = seed();
  for (;;) {
    await runBattle({
      parties: [randomTeam(s, 1), randomTeam(s, 2)],
      seed: s,
      ai: "random",
      headline: `しょうぶ かいし! (seed ${s})`,
    });
    const again = await waitForChoice("もう いちど", "やめる");
    if (!again) break;
    s = seed();
  }
  $("#battle").classList.add("hidden");
  $("#run").classList.remove("hidden");
}

/** 2択のボタンを出して待つ。`waitForButton` の2択版。 */
function waitForChoice(yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const box = $("#controls");
    box.innerHTML = "";
    for (const [label, value] of [[yes, true], [no, false]] as const) {
      const btn = document.createElement("button");
      btn.className = value ? "again" : "run";
      btn.textContent = label;
      btn.onclick = () => {
        box.innerHTML = "";
        resolve(value);
      };
      box.appendChild(btn);
    }
  });
}

export { waitForButton };
