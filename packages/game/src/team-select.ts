/**
 * レンタルからの編成（v0.5 で施設用に作り、v0.6 でカップと共有した）。
 *
 * 施設もトーナメントも「候補から N 体えらぶ」は同じなので、画面も1つにする。
 * 違いはルールセットが持っている ―― 何体えらぶか、重複を許すか。
 * 設計: docs/design/endgame.md §4 / docs/design/ui-flow.md
 */

import {
  battleSetToSource,
  validateTeam,
  type BattleSet,
  type PartySpec,
  type Ruleset,
} from "@pkmn/core";
import { gameData } from "@pkmn/data";
import { $ } from "./battle-screen.js";
import { TYPE_COLOR, TYPE_LABEL } from "./view.js";

export const escape = (text: string): string =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

export function setScreen(html: string): void {
  $("#menu").innerHTML = html;
  $("#menu").classList.remove("hidden");
  $("#battle").classList.add("hidden");
}

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

export type TeamSelectOptions = {
  title: string;
  lead: string;
  offer: readonly BattleSet[];
  ruleset: Ruleset;
  /** 補足の一行（レンタルの強さの説明など）。 */
  note?: string;
};

/**
 * レンタル候補から編成を選ばせる。やめたら null。
 *
 * v0.5〜v0.6 では捕まえた個体がまだ存在しない（v0.8）ので、
 * 施設もカップもレンタル制になる。
 */
export function chooseRentalTeam(options: TeamSelectOptions): Promise<PartySpec[] | null> {
  const { title, lead, offer, ruleset } = options;
  const selected = new Set<number>();

  return new Promise((resolve) => {
    const render = () => {
      const team = [...selected].map((i) => battleSetToSource(offer[i]!, 50));
      const problems = validateTeam(gameData, ruleset, team);
      const ready = problems.length === 0;

      setScreen(`
        <h2>${escape(title)}</h2>
        <p class="lead">${escape(lead)}</p>
        <p class="lead">レンタルから ${ruleset.teamSize}体 えらんでください
          （${selected.size}/${ruleset.teamSize}）${
            options.note === undefined ? "" : `<br /><span class="dim">${escape(options.note)}</span>`
          }</p>
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
          else if (selected.size < ruleset.teamSize) selected.add(i);
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
