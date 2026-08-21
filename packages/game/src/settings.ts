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
import { escape, setScreen } from "./team-select.js";
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
import { openFreeBattle } from "./screens.js";
import { imageCount, useArtMode } from "./art/source.js";
import { artAvailable, clearArt, countArt, loadArt, putArtFiles } from "./art/store.js";

const when = (at: number): string => new Date(at).toLocaleString("ja-JP");

/**
 * セーブと設定。
 *
 * v0.10 でタブが消えたので、**ここが常設の出口になった**（main.ts）。
 * `onClose` はマップへ戻る道 ―― 出口の無い画面を作らないための約束。
 */
export function settingsScreen(onClose: () => void): void {
  // 施設・トーナメントと同じ `#menu` に描く。
  // `#run` は連戦の進行表示（flex の1行）で、**文書を入れる場所ではない** ――
  // 一度そこへ描いて、見出しが段落の横に並ぶ画面になった
  $("#run").classList.add("hidden");

  /** 手元の素材の様子。数を数えるのに問い合わせが要るので、描き直しに載せて運ぶ。 */
  type ArtInfo = { available: boolean; stored: number };

  function render(
    slots: readonly SlotInfo[],
    available: boolean,
    art: ArtInfo,
    note = "",
  ): void {
    setScreen(`
      <button class="back" id="settings-back">← もどる</button>
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
          <br /><span class="dim">「げんさくどおり」に すると、まけたとき もちきんの はんぶんを うしないます。</span>
        </td></tr>
      </table>

      <h3>え（そざい）</h3>
      <p class="dim">
        きほんは <strong>コードで えがいた え</strong>です。そのままでも あそべます。<br />
        てもとに もっている がぞうが あれば、ここで よみこんで さしかえられます。
        <strong>がぞうは どこにも おくられません</strong>（この ブラウザの なかだけに のこります）。
      </p>
      <table class="record">
        <tr><th>えの でどころ</th><td>
          <select id="set-art">
            <option value="drawn">コードで えがく（きほん）</option>
            <option value="local">てもとの がぞう</option>
          </select>
          <br /><span class="dim">「てもとの がぞう」でも、<strong>ない ぶんは コードで えがきます</strong>。</span>
        </td></tr>
        <tr><th>よみこみずみ</th><td>${
          art.available
            ? `${art.stored}まい（いま つかえるのは ${imageCount()}まい）`
            : "<strong>この かんきょうでは そざいを おけません。</strong>"
        }</td></tr>
      </table>
      <p class="save-actions">
        <input type="file" id="art-files" accept="image/*" multiple />
        <button id="art-clear" class="danger">そざいを すてる</button>
      </p>
      <p class="dim">
        なまえの きまり: <code>tile-T.png</code> なら 木の マス、<code>tile-grass.png</code> なら くさむら。
        ファイルめいが そのまま えの なまえに なります（あわない ものは つかわれないだけ）。
      </p>

      <h3>バックアップ</h3>
      <p class="dim">
        文字を まるごと コピーして どこかに はっておけば、あとで もどせます。
        （ファイルの ほぞんは、まいこみで みているときに つかえない ことが あります）
      </p>
      <textarea id="save-text" rows="6" spellcheck="false"></textarea>
      <p class="save-actions">
        <button id="save-export">かきだす</button>
        <button id="save-import">よみこむ</button>
        <button id="save-reset" class="danger">さいしょから</button>
      </p>

      <h3>かいはつよう</h3>
      <p class="dim">
        ランダムな 3たい どうしの 1せん。**てもちが いなくても** エンジンの
        ちょうしを たしかめられます（v0.3 からある いちばん ふるい あそびかた）。
      </p>
      <p><button id="free-battle">てあわせ（フリーバトル）</button></p>`);

    $("#settings-back").onclick = () => {
      $("#menu").classList.add("hidden");
      onClose();
    };

    $<HTMLSelectElement>("#set-speed").value = save.settings.battleSpeed;
    $<HTMLSelectElement>("#set-loss").value = save.settings.lossPenalty;
    $<HTMLSelectElement>("#set-art").value = save.settings.artSource;

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

    /**
     * 絵の出どころを切り替える。
     *
     * `local` にした時点で読み込む ―― **切り替えたのに何も変わらない**のは、
     * 素材がまだ読まれていないだけ、という分かりにくい状態を作らないため。
     */
    $("#set-art").onchange = (e) => {
      const value = (e.target as HTMLSelectElement).value === "local" ? "local" : "drawn";
      useArtMode(value);
      setSave({ ...save, settings: { ...save.settings, artSource: value } });
      void autosave();
      if (value !== "local") {
        refresh("コードで えがきます。");
        return;
      }
      void loadArt().then((count) =>
        refresh(count === 0 ? "そざいが ありません。コードで えがきます。" : `そざい ${count}まいを つかいます。`),
      );
    };

    $("#art-files").onchange = (e) => {
      const picked = (e.target as HTMLInputElement).files;
      if (picked === null || picked.length === 0) return;
      void putArtFiles([...picked])
        .then(async ({ added, rejected }) => {
          // 入れたのに使われない、を避けるため **入れたら local に切り替える**
          useArtMode("local");
          setSave({ ...save, settings: { ...save.settings, artSource: "local" } });
          await autosave();
          const count = await loadArt();
          const skipped = rejected.length === 0 ? "" : `（がぞうでない ${rejected.length}けんは いれていません）`;
          refresh(`${added}まい いれました。いま ${count}まい つかえます。${skipped}`);
        })
        .catch((error: unknown) => {
          console.warn("そざいを いれられませんでした", error);
          refresh("そざいを いれられませんでした。");
        });
    };

    $("#art-clear").onclick = () => {
      if (!confirm("よみこんだ そざいを すべて すてますか?\nぼうけんの データは きえません。")) return;
      void clearArt()
        .then(() => refresh("そざいを すてました。コードで えがきます。"))
        .catch(() => refresh("そざいを すてられませんでした。"));
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

    $("#free-battle").onclick = () => {
      void openFreeBattle().then(() => refresh());
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
    render([], true, { available: true, stored: imageCount() }, note);
    void Promise.all([saveStore().listSlots(), saveAvailable(), artAvailable(), countArt()])
      .then(([slots, available, artOk, stored]) =>
        render(slots, available, { available: artOk, stored }, note),
      )
      .catch((error: unknown) => {
        console.warn("セーブの状態を読めませんでした", error);
        render([], false, { available: false, stored: 0 }, "セーブの じょうたいを よめませんでした。");
      });
  }

  refresh();
}
