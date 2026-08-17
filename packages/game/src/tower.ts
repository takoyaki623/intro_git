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
  validateTeam,
  type AiConfig,
  type BattleSet,
  type Facility,
  type FacilityRun,
  type PartySpec,
  type SaveData,
  type SaveStore,
} from "@pkmn/core";
import { allBattleSets, gameData } from "@pkmn/data";
import { $, runBattle, waitForButton } from "./battle-screen.js";
import { TYPE_COLOR, TYPE_LABEL } from "./view.js";

/** レンタルの候補数。多すぎると選ぶのが作業になる。 */
const RENTAL_CHOICES = 6;

type Context = {
  save: SaveData;
  store: SaveStore;
  onSaveChanged: (save: SaveData) => void;
};

const escape = (text: string) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

function setScreen(html: string): void {
  $("#menu").innerHTML = html;
  $("#menu").classList.remove("hidden");
  $("#battle").classList.add("hidden");
}

// ─────────────────────────────────────────────
// 編成
// ─────────────────────────────────────────────

function cardFor(set: BattleSet, index: number, selected: boolean): string {
  const species = gameData.species(set.species);
  const types = species.types
    .map((t) => `<span class="type" style="background:${TYPE_COLOR[t]}">${TYPE_LABEL[t]}</span>`)
    .join("");
  const moves = set.moves.map((m) => escape(gameData.move(m).name)).join("・");
  return `
    <button class="rental ${selected ? "on" : ""}" data-i="${index}">
      <div class="row">
        <strong>${escape(species.name)}</strong>
        <span class="types">${types}</span>
      </div>
      <div class="meta">${moves}</div>
      <div class="meta gearline">
        ${escape(gameData.ability(set.ability).name)} ・ ${escape(gameData.item(set.item).name)}
      </div>
    </button>`;
}

/**
 * レンタル候補から編成を選ばせる。
 *
 * v0.5 では捕まえた個体がまだ存在しない（v0.8）ので、全ての施設がレンタル制になる。
 * 同じ BattleSet を相手プールとレンタルの両方に使う ―― 1つのデータが2用途、
 * というのが endgame.md §6 の狙いそのもの。
 */
function chooseTeam(facility: Facility, seed: number): Promise<PartySpec[] | null> {
  // レンタルは相手より強い grade から貸す（連勝が伸びる余地を作るための差）
  const rng = createRng(createRngState(seed));
  const offer = buildOpponentParty(allBattleSets, facility.rentalGrade, RENTAL_CHOICES, rng);
  const selected = new Set<number>();

  return new Promise((resolve) => {
    const render = () => {
      const team = [...selected].map((i) => battleSetToSource(offer[i]!, 50));
      const problems = validateTeam(gameData, facility.ruleset, team);
      const ready = problems.length === 0;

      setScreen(`
        <h2>${escape(facility.name)}</h2>
        <p class="lead">${escape(facility.description)}</p>
        <p class="lead">レンタルから ${facility.ruleset.teamSize}体 えらんでください
          （${selected.size}/${facility.ruleset.teamSize}）</p>
        <div class="rentals">${offer.map((s, i) => cardFor(s, i, selected.has(i))).join("")}</div>
        <p class="problems">${problems.map(escape).join(" / ")}</p>
        <div class="menu-actions">
          <button id="go" ${ready ? "" : "disabled"}>ちょうせん する</button>
          <button id="back" class="ghost">やめる</button>
        </div>`);

      for (const el of $("#menu").querySelectorAll<HTMLElement>(".rental")) {
        el.onclick = () => {
          const i = Number(el.dataset["i"]);
          if (selected.has(i)) selected.delete(i);
          else if (selected.size < facility.ruleset.teamSize) selected.add(i);
          render();
        };
      }
      $("#go").onclick = () => {
        if (!ready) return;
        resolve([...selected].map((i) => battleSetToSource(offer[i]!, 50)));
      };
      $("#back").onclick = () => resolve(null);
    };
    render();
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

