/**
 * バトル施設の画面（v0.5）― 編成・連戦・結果。
 *
 * ここに施設ごとの分岐は書かない。表示も進行もすべて Facility のデータから決まる。
 * 施設を1つ増やしても、このファイルは変わらない。
 * 設計: docs/design/endgame.md §4・§8 / docs/design/ui-flow.md
 */

import {
  applyBattleOutcome,
  bandFor,
  battleSetToSource,
  buildOpponentParty,
  createRng,
  createRngState,
  nextOpponent,
  playerParty,
  recordRun,
  startRun,
  type AiConfig,
  type Facility,
  type FacilityRun,
  type PartySpec,
  type SaveData,
  type SaveStore,
} from "@pkmn/core";
import { allBattleSets, gameData } from "@pkmn/data";
import { $, runBattle, waitForButton } from "./battle-screen.js";
import { chooseRentalTeam, escape, setScreen } from "./team-select.js";

/** レンタルの候補数。多すぎると選ぶのが作業になる。 */
const RENTAL_CHOICES = 6;

type Context = {
  save: SaveData;
  store: SaveStore;
  onSaveChanged: (save: SaveData) => void;
};

// ─────────────────────────────────────────────
// 編成
// ─────────────────────────────────────────────

/**
 * レンタル候補から編成を選ばせる。
 *
 * レンタルは相手より強い grade から貸す ―― 同格だと1戦が五分になり、
 * 連勝の確率が 0.5^n に落ちて施設として成立しない（endgame.md §11.5）。
 */
function chooseTeam(facility: Facility, seed: number): Promise<PartySpec[] | null> {
  const rng = createRng(createRngState(seed));
  const offer = buildOpponentParty(allBattleSets, facility.rentalGrade, RENTAL_CHOICES, rng);
  return chooseRentalTeam({
    title: facility.name,
    lead: facility.description,
    offer,
    ruleset: facility.ruleset,
    note: `レンタルは あいてより つよい しあがり（grade ${facility.rentalGrade}）です`,
  });
}

// ─────────────────────────────────────────────
// 連戦
// ─────────────────────────────────────────────

function showProgress(facility: Facility, run: FacilityRun): void {
  const band = bandFor(facility, run.streak + 1);
  $("#run").innerHTML = `
    <span>${escape(facility.name)}</span>
    <span>${run.streak} れんしょう / ${facility.streakCap}</span>
    <span>この ちょうせんの BP ${run.earnedBp}</span>
    <span class="dim">あいての つよさ ${band.grade}</span>`;
  $("#run").classList.remove("hidden");
}

export async function playFacility(
  facility: Facility,
  context: Context,
  seed: number,
): Promise<void> {
  const team = await chooseTeam(facility, seed);
  if (team === null) return;

  let run = startRun(facility, team, seed);
  $("#menu").classList.add("hidden");

  while (run.state === "inProgress") {
    showProgress(facility, run);

    const next = nextOpponent(facility, allBattleSets, run);
    run = next.run;
    const band = next.band;
    const ai: AiConfig = {
      policy: "basic",
      mistakeRate: band.mistakeRate,
      knowledge: "fair",
    };

    const winner = await runBattle({
      parties: [playerParty(facility, run), next.party],
      seed: seed + run.battleIndex * 7919,
      ai,
      headline: `${run.streak + 1} せんめ! あいては ${next.sets
        .map((s) => gameData.species(s.species).name)
        .join("・")}`,
    });

    const outcome = applyBattleOutcome(facility, run, winner === 0);
    run = outcome.run;
    showProgress(facility, run);

    if (outcome.gainedBp > 0) {
      await waitForButton(`${outcome.gainedBp} BP を てにいれた! つぎへ`);
    }
  }

  // ── 結果 ──
  const save = recordRun(context.save, facility.id, {
    streak: run.streak,
    wins: run.streak,
    bp: run.earnedBp,
  });
  await context.store.save(0, save);
  context.onSaveChanged(save);

  $("#run").classList.add("hidden");
  $("#battle").classList.add("hidden");
  const record = save.global.endgame.facilityRecords[facility.id]!;
  setScreen(`
    <h2>${run.state === "won" ? "せいは!" : "ちょうせん しゅうりょう"}</h2>
    <table class="result">
      <tr><th>れんしょう</th><td>${run.streak}</td></tr>
      <tr><th>てにいれた BP</th><td>${run.earnedBp}</td></tr>
      <tr><th>さいこう きろく</th><td>${record.bestStreak}</td></tr>
      <tr><th>もっている BP</th><td>${save.global.bp}</td></tr>
    </table>
    <p class="lead">${
      run.state === "won"
        ? `${facility.streakCap} れんしょう で うちどめです。上限の かいじょは AI smart と どうじ（v1.1）。`
        : "れんしょうは リセットされますが、てにいれた BP は なくなりません。"
    }</p>
    <div class="menu-actions"><button id="back">もどる</button></div>`);

  await new Promise<void>((resolve) => {
    $("#back").onclick = () => resolve();
  });
}

/** 施設の一覧。記録が残っていれば一緒に出す。 */
export function facilityMenu(
  facilities: readonly Facility[],
  save: SaveData,
  onPick: (facility: Facility) => void,
): void {
  const rows = facilities
    .map((f) => {
      const record = save.global.endgame.facilityRecords[f.id];
      const best = record === undefined ? "きろく なし" : `さいこう ${record.bestStreak} れんしょう`;
      return `
        <button class="facility" data-id="${f.id}">
          <div class="row"><strong>${escape(f.name)}</strong><span class="meta">${best}</span></div>
          <div class="meta">${escape(f.description)}</div>
        </button>`;
    })
    .join("");

  setScreen(`
    <h2>バトル しせつ</h2>
    <p class="lead">もっている BP: <strong>${save.global.bp}</strong></p>
    <div class="facilities">${rows}</div>
    <p class="lead dim">しせつは ルールセットと あいてプールと ほうしゅう の3つの データで できています。
      1つ ふやしても コードは かわりません。</p>`);

  for (const el of $("#menu").querySelectorAll<HTMLElement>(".facility")) {
    el.onclick = () => {
      const facility = facilities.find((f) => f.id === el.dataset["id"]);
      if (facility !== undefined) onPick(facility);
    };
  }
}

