/**
 * セーブと設定の画面（v0.9）。
 *
 * ここが「セーブが完成した」ことを目に見える形にする唯一の場所。
 * オートセーブは黙って動くので、**動いている証拠を人に見せる画面が要る** ――
 * 保存できない環境（プライベートモードなど）で黙って消えるのが最悪だから。
 *
 * 書き出しは**テキストで見せてコピーさせる**。ファイルのダウンロードは
 * 埋め込みで見るときに封じられていることがあり、押しても何も起きない
 * ボタンになる（game-plan.md §10）。
 *
 * 設計: docs/design/save-data.md §6・§8
 */

import { exportSave, importSave, summarize, type SlotInfo } from "@pkmn/core";
import { $ } from "./battle-screen.js";
import { setSpeed, type Speed } from "./battle-screen.js";
import { escape } from "./team-select.js";
import {
  autosave,
  loadPlayer,
  resetPlayer,
  save,
  saveStore,
  setSave,
  toSave,
  SLOT,
} from "./player.js";
import { saveAvailable } from "./save.js";

const when = (at: number): string => new Date(at).toLocaleString("ja-JP");

export function settingsScreen(): void {
  $("#menu").classList.add("hidden");
  $("#battle").classList.add("hidden");
  const root = $("#run");
  root.classList.remove("hidden");

  function render(slots: readonly SlotInfo[], available: boolean, note = ""): void {
    root.innerHTML = `
      <h2>セーブと せってい</h2>
      <p class="lead">${
        available
          ? "この きたいでは じどうで セーブされます。"
          : "<strong>この かんきょうでは セーブできません。</strong>とじると きえます。"
      }</p>
      <p id="save-note" class="dim">${escape(note)}</p>

      <h3>いまの ぼうけん</h3>
      <table class="record">
        <tr><th>ないよう</th><td>${escape(summarize(toSave()))}</td></tr>
        <tr><th>ほぞんずみ</th><td>${
          slots.length === 0
            ? "まだ ありません"
            : slots.map((s) => `${escape(when(s.savedAt))}<br /><span class="dim">${escape(s.summary)}</span>`).join("<hr />")
        }</td></tr>
      </table>
      <p><button id="save-now">いま セーブする</button></p>

      <h3>せってい</h3>
      <table class="record">
        <tr><th>バトルの はやさ</th><td>
          <select id="set-speed">
            <option value="normal">つうじょう</option>
            <option value="fast">こうそく</option>
            <option value="logOnly">ログのみ</option>
          </select>
        </td></tr>
        <tr><th>まけたとき</th><td>
          <select id="set-loss">
            <option value="none">おかねを うしなわない</option>
            <option value="classic">げんさくどおり おかねを はらう</option>
          </select>
          <br /><span class="dim">「げんさくどおり」は v0.9 の しはらい しょりが 入ってから きき ます。</span>
        </td></tr>
      </table>

      <h3>バックアップ</h3>
      <p class="dim">
        文字を まるごと コピーして どこかに はっておけば、あとで もどせます。
        （ファイルの ほぞんは、まいこみで みているときに つかえない ことが あります）
      </p>
      <textarea id="save-text" rows="6" spellcheck="false"></textarea>
      <p>
        <button id="save-export">かきだす</button>
        <button id="save-import">よみこむ</button>
        <button id="save-reset" class="danger">さいしょから</button>
      </p>`;

    $<HTMLSelectElement>("#set-speed").value = save.settings.battleSpeed;
    $<HTMLSelectElement>("#set-loss").value = save.settings.lossPenalty;

    const text = $<HTMLTextAreaElement>("#save-text");

    $("#save-now").onclick = () => {
      void autosave().then(() => refresh("セーブしました。"));
    };

    $("#set-speed").onchange = (e) => {
      const value = (e.target as HTMLSelectElement).value as Speed;
      setSpeed(value);
      setSave({ ...save, settings: { ...save.settings, battleSpeed: value } });
      void autosave();
    };

    $("#set-loss").onchange = (e) => {
      const value = (e.target as HTMLSelectElement).value === "classic" ? "classic" : "none";
      setSave({ ...save, settings: { ...save.settings, lossPenalty: value } });
      void autosave();
    };

    $("#save-export").onclick = () => {
      text.value = exportSave(toSave());
      text.select();
      $("#save-note").textContent = "コピーして ほぞんして ください。";
    };

    $("#save-import").onclick = () => {
      // 読めないものを読んだときに、黙って新規データを作らない（save-data.md §5）
      const loaded = importSave(text.value);
      if (loaded === null) {
        $("#save-note").textContent = "よみこめませんでした。データを かえていません。";
        return;
      }
      loadPlayer(loaded);
      void saveStore().save(SLOT, loaded).then(() => refresh("よみこみました。「ぼうけん」で つづきから。"));
    };

    $("#save-reset").onclick = () => {
      if (!confirm("ほんとうに さいしょから はじめますか?\nいまの ぼうけんは きえます。")) return;
      void resetPlayer().then(() => refresh("さいしょから はじめます。「ぼうけん」を えらんで ください。"));
    };
  }

  /**
   * まず描いてから、保存先に問い合わせて描き直す。
   *
   * 問い合わせの結果を待ってから描くと、**IndexedDB が答えない環境で
   * 画面が真っ白のまま止まる。** 保存の画面がいちばんそうなってはいけない。
   */
  function refresh(note = ""): void {
    render([], true, note);
    void Promise.all([saveStore().listSlots(), saveAvailable()])
      .then(([slots, available]) => render(slots, available, note))
      .catch((error: unknown) => {
        console.warn("セーブの状態を読めませんでした", error);
        render([], false, "セーブの じょうたいを よめませんでした。");
      });
  }

  refresh();
}
