/**
 * トーナメントの画面（v0.6）― カップ選択・ティア選択・編成・勝ち抜き・結果。
 *
 * 施設の画面（tower.ts）と同じ形をしている。違うのは
 * 「連勝を伸ばす」か「勝ち抜く」かだけで、どちらもデータから決まる。
 * 設計: docs/design/endgame.md §7 / docs/design/ui-flow.md
 */

import {
  aiFor,
  applyCupOutcome,
  availableTiers,
  battleSetToSource,
  buildOpponentParty,
  createRng,
  createRngState,
  cupPlayerParty,
  currentOpponent,
  opponentParty,
  recordCupWin,
  rentalGradeFor,
  startCupRun,
  syncedLevel,
  TIER_LABEL,
  type NamedCharacter,
  type PartySpec,
  type SaveData,
  type SaveStore,
  type TierId,
  type Tournament,
  type TournamentRun,
} from "@pkmn/core";
import { allBattleSets, allNamed, gameData } from "@pkmn/data";
import { player } from "./player.js";
import { $, runBattle, waitForButton } from "./battle-screen.js";
import { chooseOwnTeam, chooseRentalTeam, escape, setScreen } from "./team-select.js";

type Context = {
  save: SaveData;
  store: SaveStore;
  onSaveChanged: (save: SaveData) => void;
};

const ROLE_LABEL: Record<string, string> = {
  gymLeader: "ジムリーダー",
  elite4: "四天王",
  champion: "チャンピオン",
  rival: "ライバル",
  villain: "ボス",
  other: "その他",
};

const nameOf = (id: string): string => allNamed.find((c) => c.id === id)?.name ?? id;

// ─────────────────────────────────────────────
// 勝ち抜き表
// ─────────────────────────────────────────────

function showBracket(cup: Tournament, run: TournamentRun): void {
  const steps = run.bracket
    .map((id, i) => {
      const state = i < run.round ? "done" : i === run.round ? "now" : "";
      return `<span class="step ${state}">${escape(nameOf(id))}</span>`;
    })
    .join('<span class="arrow">›</span>');

  $("#run").innerHTML = `
    <span>${escape(cup.name)}</span>
    <span class="tier">${TIER_LABEL[run.tier]}</span>
    <span class="bracket">${steps}</span>`;
  $("#run").classList.remove("hidden");
}

/** 相手の紹介。theme をそのまま出す ―― キャラの設計がそのまま画面に出る。 */
function introOf(character: NamedCharacter, tier: TierId): string[] {
  const badge = character.concept.type === undefined
    ? "オールラウンダー"
    : `${gameData.species(character.signature).name} 使い`;
  return [
    `${ROLE_LABEL[character.role] ?? character.role} ${character.name}（${badge}）が しょうぶを しかけてきた!`,
    character.dialogue[tier]?.before ?? `${character.name} 「${character.concept.theme}」`,
  ];
}

// ─────────────────────────────────────────────
// 挑戦
// ─────────────────────────────────────────────

/**
 * カップの編成。**タイプ縛りカップは「自分の手持ちで」挑む**（v0.11）。
 *
 * レンタルで縛ると、貸し出しの6体にそのタイプが3体入らない限り
 * **編成が組めずに詰む。** タイプを絞った時点で候補が薄くなるので、
 * 「そのタイプを自分で育ててから来る」方がカップの意味にも合う
 * ―― 縛りは制限ではなく、集めた成果を使う場所（endgame.md §5）。
 */
function chooseCupTeam(
  cup: Tournament,
  tier: TierId,
  seed: number,
): Promise<PartySpec[] | null> {
  const level = cup.ruleset.levelMode.kind === "sync" ? syncedLevel(cup.ruleset, 50) : null;

  if (cup.ruleset.teamSource === "own") {
    const candidates = [...player.storage.party, ...player.storage.box];
    if (candidates.length < cup.ruleset.teamSize) {
      return notEnoughOwn(cup, candidates.length);
    }
    return chooseOwnTeam({
      title: `${cup.name}（${TIER_LABEL[tier]}）`,
      lead: cup.description,
      candidates,
      ruleset: cup.ruleset,
      syncedLevel: level,
    });
  }

  const grade = rentalGradeFor(cup, tier);
  const offer = buildOpponentParty(allBattleSets, grade, 6, createRng(createRngState(seed)));
  return chooseRentalTeam({
    title: `${cup.name}（${TIER_LABEL[tier]}）`,
    lead: cup.description,
    offer,
    ruleset: cup.ruleset,
    note: `レンタルは 相手と おなじ しあがり（grade ${grade}）です`,
  });
}

/** 手持ちが足りないことを、黙って戻らずに伝える。 */
function notEnoughOwn(cup: Tournament, have: number): Promise<null> {
  return new Promise((resolve) => {
    setScreen(`
      <h2>${escape(cup.name)}</h2>
      <p class="lead">${escape(cup.description)}</p>
      <div class="note-box">
        <p>ここは <strong>じぶんの ポケモン</strong> で ちょうせん する カップです。</p>
        <p>${cup.ruleset.teamSize}体 ひつようですが、いま ${have}体 しか いません。</p>
        <p class="dim">ちほうで つかまえて、ほかんこに おくってから きてください。</p>
      </div>
      <div class="menu-actions"><button id="back" class="ghost">もどる</button></div>`);
    $("#back").onclick = () => resolve(null);
  });
}

export async function playCup(
  cup: Tournament,
  tier: TierId,
  context: Context,
  seed: number,
): Promise<void> {
  const team: PartySpec[] | null = await chooseCupTeam(cup, tier, seed);
  if (team === null) return;

  let run = startCupRun(cup, allNamed, tier, team, seed);
  $("#menu").classList.add("hidden");

  while (run.state === "inProgress") {
    showBracket(cup, run);
    const character = currentOpponent(run, allNamed);

    const { winner } = await runBattle({
      parties: [cupPlayerParty(cup, run), opponentParty(gameData, cup, run, character)],
      seed: seed + run.round * 7919,
      ai: aiFor(character, tier),
      headline: introOf(character, tier),
    });

    const outcome = applyCupOutcome(cup, run, winner === 0);
    run = outcome.run;
    showBracket(cup, run);

    if (run.state === "inProgress") {
      await waitForButton(`${character.name} に かった! つぎの あいてへ`);
    }
  }

  // ── 結果 ──
  const champion = run.state === "won";
  const bp = champion ? (cup.bpByTier[tier] ?? 0) : 0;
  const save = champion ? recordCupWin(context.save, cup.id, tier, bp) : context.save;
  if (champion) {
    await context.store.save(0, save);
    context.onSaveChanged(save);
  }

  $("#run").classList.add("hidden");
  $("#battle").classList.add("hidden");

  const cleared = save.global.endgame.tournamentRecords[cup.id]?.clearedTiers ?? [];
  const unlocked = availableTiers(cup, cleared).find((t) => t.unlocked && !cleared.includes(t.tier));

  setScreen(`
    <h2>${champion ? "ゆうしょう!" : "はいたい"}</h2>
    <table class="result">
      <tr><th>カップ</th><td>${escape(cup.name)}（${TIER_LABEL[tier]}）</td></tr>
      <tr><th>かちぬき</th><td>${run.round} / ${cup.rounds}</td></tr>
      <tr><th>てにいれた BP</th><td>${bp}</td></tr>
      <tr><th>もっている BP</th><td>${save.global.bp}</td></tr>
    </table>
    <p class="lead">${
      champion
        ? unlocked === undefined
          ? "このカップは 制覇しました。"
          : `<strong>${TIER_LABEL[unlocked.tier]}ティア</strong> が かいほう されました。`
        : "トーナメントは 1敗で おわりです。もう いちど ちょうせん できます。"
    }</p>
    <div class="menu-actions"><button id="back">もどる</button></div>`);

  await new Promise<void>((resolve) => {
    $("#back").onclick = () => resolve();
  });
}

// ─────────────────────────────────────────────
// 一覧
// ─────────────────────────────────────────────

export function cupMenu(
  cups: readonly Tournament[],
  save: SaveData,
  onPick: (cup: Tournament, tier: TierId) => void,
): void {
  const rows = cups
    .map((cup) => {
      const cleared = save.global.endgame.tournamentRecords[cup.id]?.clearedTiers ?? [];
      const tiers = availableTiers(cup, cleared)
        .map(({ tier, unlocked }) => {
          const done = cleared.includes(tier);
          const label = `${TIER_LABEL[tier]}${done ? " ✓" : ""}`;
          return unlocked
            ? `<button class="tier-pick ${done ? "done" : ""}" data-cup="${cup.id}" data-tier="${tier}">${label}</button>`
            : `<span class="tier-locked">${TIER_LABEL[tier]}（ロック）</span>`;
        })
        .join("");
      const entrants = cup.entrantPool.map((id) => escape(nameOf(id))).join("・");
      return `
        <div class="cup">
          <div class="row"><strong>${escape(cup.name)}</strong>
            <span class="meta">${cup.rounds}人ぬき</span></div>
          <div class="meta">${escape(cup.description)}</div>
          <div class="meta entrants">${entrants}</div>
          <div class="tiers">${tiers}</div>
        </div>`;
    })
    .join("");

  setScreen(`
    <h2>トーナメント</h2>
    <p class="lead">もっている BP: <strong>${save.global.bp}</strong></p>
    <div class="cups">${rows}</div>
    <p class="lead dim">出場者は 毎回 プールから ちゅうせん されます。
      原作ティアで ゆうしょう すると 本気ティアが かいほう されます
      （極ティアは AI smart と どうじ / v1.1）。</p>`);

  for (const el of $("#menu").querySelectorAll<HTMLElement>(".tier-pick")) {
    el.onclick = () => {
      const cup = cups.find((c) => c.id === el.dataset["cup"]);
      const tier = el.dataset["tier"] as TierId | undefined;
      if (cup !== undefined && tier !== undefined) onPick(cup, tier);
    };
  }
}

// ─────────────────────────────────────────────
// 図鑑がわりのネームド一覧
// ─────────────────────────────────────────────

/** 「今までの全てのトレーナーが出る」の可視化。倒した相手が積み上がっていく。 */
export function namedList(): void {
  const byRole = new Map<string, NamedCharacter[]>();
  for (const c of allNamed) {
    byRole.set(c.role, [...(byRole.get(c.role) ?? []), c]);
  }

  const sections = [...byRole.entries()]
    .map(([role, list]) => {
      const cards = list
        .map((c) => {
          const type = c.concept.type;
          const tiers = Object.keys(c.tiers)
            .map((t) => TIER_LABEL[t as TierId])
            .join("・");
          return `
            <div class="named">
              <div class="row"><strong>${escape(c.name)}</strong>
                <span class="meta">${type === undefined ? "―" : escape(type)}</span></div>
              <div class="meta">${escape(c.concept.theme)}</div>
              <div class="meta dim">エース ${escape(gameData.species(c.signature).name)} ／ ${tiers}</div>
            </div>`;
        })
        .join("");
      return `<h3>${ROLE_LABEL[role] ?? role}</h3><div class="nameds">${cards}</div>`;
    })
    .join("");

  setScreen(`
    <h2>ネームド ずかん</h2>
    <p class="lead">カントーの ${allNamed.length}人。1人あたり 原作・本気の 2ティアを 持っています。</p>
    ${sections}
    <p class="lead dim">キャラを1人 足すと、ティアのぶんだけ コンテンツが 増えます。
      theme（そのキャラらしさ）を 先に 決めてから パーティを 組んでいます。</p>`);
}
