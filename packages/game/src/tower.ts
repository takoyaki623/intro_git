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
  syncedLevel,
  recordRun,
  startRun,
  type AiConfig,
  type Facility,
  type FacilityRun,
  type PartySpec,
  type SaveData,
  type SaveStore,
} from "@pkmn/core";
import { allBattleSets, allItems, gameData } from "@pkmn/data";
import { $, runBattle, waitForButton } from "./battle-screen.js";
import { chooseOwnTeam, chooseRentalTeam, escape, setScreen } from "./team-select.js";
// セーブ本体は `player.ts` が1つだけ持つ。BP を減らすので、
// 引数で渡された写しではなく**生きている方**を見る（写しは1回押すと古くなる）
import { autosave, player, save as liveSave, setSave } from "./player.js";

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
  // 施設が「自分の手持ちで挑む」ものなら、候補の出どころが変わるだけ。
  // 選ぶ画面も編成の検証も同じものを使う（v0.8）
  if (facility.ruleset.teamSource === "own") {
    const candidates = [...player.storage.party, ...player.storage.box];
    if (candidates.length < facility.ruleset.teamSize) {
      return notEnough(facility, candidates.length);
    }
    return chooseOwnTeam({
      title: facility.name,
      lead: facility.description,
      candidates,
      ruleset: facility.ruleset,
      syncedLevel: facility.ruleset.levelMode.kind === "sync" ? syncedLevel(facility.ruleset, 50) : null,
    });
  }

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

/** 手持ちが足りないことを、黙って戻らずに伝える。 */
function notEnough(facility: Facility, have: number): Promise<null> {
  return new Promise((resolve) => {
    setScreen(`
      <h2>${escape(facility.name)}</h2>
      <p class="lead">${escape(facility.description)}</p>
      <div class="note-box">
        <p>ここは <strong>じぶんで つかまえた ポケモン</strong> で ちょうせん する しせつです。</p>
        <p>${facility.ruleset.teamSize}体 ひつようですが、いま ${have}体 しか いません。</p>
        <p class="dim">「ぼうけん」で つかまえてから もういちど きてください。</p>
      </div>
      <div class="menu-actions"><button id="back" class="ghost">もどる</button></div>`);
    $("#back").onclick = () => resolve(null);
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

    const { winner } = await runBattle({
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
      1つ ふやしても コードは かわりません。</p>
    <h3>BP こうかんじょ</h3>
    <p class="lead dim">
      たいせんで つよい もちものは <strong>おかねでは かえません</strong>。
      しせつで かせいだ BP とだけ こうかんできます（economy.md §7）。
    </p>
    <div class="facilities" id="bp-shop">${exchangeRows()}</div>`);

  for (const el of $("#menu").querySelectorAll<HTMLElement>(".facility")) {
    el.onclick = () => {
      const facility = facilities.find((f) => f.id === el.dataset["id"]);
      if (facility !== undefined) onPick(facility);
    };
  }
  bindExchange(() => facilityMenu(facilities, liveSave, onPick));
}

/**
 * BP交換所（v0.9）。
 *
 * **お金と BP は別の経済**（economy.md §7）。
 * 「施設を遊ぶ → BP を稼ぐ → 個体を強くする → 上位に挑む」という循環が主動線で、
 * お金でも同じものが買えると、この動線が二重になって薄まる。
 * 品揃えは道具データの `bpPrice` がそのまま決める ―― ここに一覧は無い。
 */
const exchangeStock = () => allItems.filter((i) => i.bpPrice !== undefined);

function exchangeRows(): string {
  return exchangeStock()
    .map((item) => {
      const owned = player.bag[item.id] ?? 0;
      const enough = liveSave.global.bp >= (item.bpPrice ?? 0);
      return `
        <button class="facility${enough ? "" : " dim"}" data-bp="${item.id}"${enough ? "" : " disabled"}>
          <div class="row">
            <strong>${escape(item.name)}</strong>
            <span class="meta">${item.bpPrice} BP${owned > 0 ? ` ・ ${owned}こ` : ""}</span>
          </div>
        </button>`;
    })
    .join("");
}

function bindExchange(redraw: () => void): void {
  for (const el of $("#menu").querySelectorAll<HTMLElement>("[data-bp]")) {
    el.onclick = () => {
      const item = exchangeStock().find((i) => i.id === el.dataset["bp"]);
      if (item === undefined) return;
      const cost = item.bpPrice ?? 0;
      if (liveSave.global.bp < cost) return;

      // BP はセーブが持ち、道具はプレイヤーが持つ。**両方を1回の操作で動かす**
      setSave({ ...liveSave, global: { ...liveSave.global, bp: liveSave.global.bp - cost } });
      player.bag[item.id] = (player.bag[item.id] ?? 0) + 1;
      void autosave().then(redraw);
    };
  }
}

