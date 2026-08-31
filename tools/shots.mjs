/**
 * 代表画面をまとめて撮る（v0.10.5）。
 *
 *   npm run dev            （別のターミナルで）
 *   npm run shots
 *
 * **見た目に自動判定は無い。** 撮って並べて目で見るしかない。
 * したふりをするより、見るための道具をちゃんと作る方がよい。
 *
 * 撮ったものは `dist/shots/` に置き、`tools/gallery.mjs` が
 * スマホで見られる1枚の HTML にまとめる。
 */

import { chromium } from "playwright";
import { FIELD_ABILITIES, emptyWorldState, neighborsOf, walkableTerrains } from "@pkmn/core";
import { allFieldAbilities } from "@pkmn/data";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:5173/";
const OUT = "dist/shots";
const CHROME = process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium";

/** マップの経路探索（playthrough.mjs と同じ考え方）。 */
const MAPS = new Map(
  JSON.parse(readFileSync("packages/data/maps.json", "utf8")).map((m) => [m.id, m]),
);
const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

/**
 * 撮影用のセーブは**フィールド技を全部持っている**（v0.12-e）ので、
 * 経路探索も水の上を通れる扱いにする。知らないままだと、グレンじまへ
 * 「経路なし」と言いながら**その場でシャッターを切って別の町の絵を保存する。**
 *
 * 障害物も壁として数えない。台本は岩をどける操作をしないが、
 * どの岩も「持っていれば必ずどけられる」ものなので、
 * 壁として数えるとチャンピオンロードから先が全部撮れなくなる
 * ―― v1.1-a で `neighborsOf` に寄せたとき、ここのコメントだけが
 * 「障害物は壁のまま」と書いてあってコードと食い違っていた。
 * 一本化して初めて食い違いが見えた（`△` が2件出た）。
 *
 * 「隣とは何か」は core の `neighborsOf` が持つ（v1.1-a）。
 */
const able = {
  ...emptyWorldState(),
  abilities: [...FIELD_ABILITIES],
  walkable: walkableTerrains(allFieldAbilities, [...FIELD_ABILITIES]),
};
const SEEING = { ignoreConditional: true, ignoreObstacles: true };

function neighbors(id, x, y) {
  return neighborsOf(MAPS.get(id), able, x, y, SEEING, MAPS).map((n) => ({
    key: KEY[n.dir],
    map: n.map,
    x: n.x,
    y: n.y,
  }));
}

function route(from, to) {
  const id = (n) => `${n.map}|${n.x},${n.y}`;
  const prev = new Map([[id(from), null]]);
  const queue = [from];
  while (queue.length > 0) {
    const here = queue.shift();
    if (here.map === to.map && here.x === to.x && here.y === to.y) {
      const path = [];
      for (let cur = id(here); ; ) {
        const step = prev.get(cur);
        if (!step) break;
        path.unshift(step.key);
        cur = id(step.from);
      }
      return path;
    }
    for (const next of neighbors(here.map, here.x, here.y)) {
      if (prev.has(id(next))) continue;
      prev.set(id(next), { key: next.key, from: here });
      queue.push(next);
    }
  }
  return null;
}

/**
 * **場所は近いものどうし並べる。**
 *
 * 撮影は1枚ごとにセーブを読み直さず、前の場所から歩いて次へ向かう。
 * `goTo` の引き直しは60回で、遠いほど途中の野生で使い切る ――
 * こおりのぬけみち の たきつぼ をカントーの列の途中に置いたら、
 * **次の1枚がタマムシまで161歩**になり、そこから先の19枚が `△` になった（v1.2-a）。
 * 台本の「確かめる場所の隣に居るうちに確かめる」と同じ話が、撮影にもある。
 */

/**
 * 撮影用のセーブ。
 *
 * fixtures の v4 を土台にして、**進行を開けておく**（御三家を持っている・
 * ライバル戦が済んでいる）。撮影のたびに同じ絵になるので、
 * 前後の比較ができる ―― 見た目の確認はそれが全て。
 */
const SHOOTING_SAVE = (() => {
  const save = JSON.parse(readFileSync("fixtures/saves/v4.json", "utf8"));
  save.global.currentRegion = "kanto";
  save.regions.kanto.flags = {
    "kanto.pallet.got-starter": true,
    "kanto.pallet.rival-battled": true,
    "kanto.pallet.talked-mom": true,
    // 北の警備員をどかす（v0.12）。開けておかないとニビまで行けない
    "kanto.viridian.talked-guard": true,
    // トキワジムの うけつけ（v0.12-e）。開けておかないとジム8の中を撮れない
    "kanto.viridian.gym-open": true,
  };
  /**
   * **トレーナーは全員 倒した状態にする。** 撮りたいのは町であって連戦ではない。
   *
   * ここは v0.12-e から**1人ずつ手で並べていた**。理由は毎回同じで、
   * 視線に入ると戦いになり、負ければ復活地点へ飛ぶ ――
   * 「トキワジム」の絵としてマサラタウンが保存された日から、
   * ジムが仕掛けつきになった日も、シルフの廊下も、ナナシマも、
   * **新しく1人置くたびにここへ1行足す**という同じ作業をしていた。
   * 45行まで伸びて、v1.1-i でジムに17人足したときにまた足りなくなった。
   *
   * トレーナーは全員 `defeatedFlag` を持っている（検証が見ている）ので、
   * **並べるのをやめてデータから引く。** 誰かを足しても、ここは何も要らない
   * ―― 「同じことを2箇所に書くと、片方だけ直した跡が残る」。
   */
  for (const trainer of JSON.parse(readFileSync("packages/data/trainers.json", "utf8"))) {
    save.regions.kanto.flags[trainer.defeatedFlag] = true;
  }
  // リーグまで撮る（v0.12-f）。**扉は勝つまで開かない**ので、
  // 開けておかないとワタルの部屋に一生たどり着けない
  save.regions.kanto.flags["kanto.league.gate-open"] = true;
  save.regions.kanto.badges = 8;
  // フィールド技（v0.12-d）。**覚えていないと そらをとぶ のボタンが出ない**ので、
  // 撮りたい画面が1枚まるごと消える
  //
  // **フラッシュも入れる**（v1.2-a）。既定は明るい側 ――
  // 入れないと、暗いのを見せたい1枚のために**他の洞窟が全部まっ暗**になる。
  // 「フラッシュ前」の1枚だけは `without` で落として撮る
  for (const flag of [
    "kanto.ability.cut", "kanto.ability.surf", "kanto.ability.strength",
    "kanto.ability.rock-smash", "kanto.ability.fly", "kanto.ability.waterfall",
    "kanto.ability.flash",
  ]) {
    save.regions.kanto.flags[flag] = true;
  }
  // 行ったことのある町（そらをとぶ の行き先）。実際に歩けば立つが、撮影は歩かない
  for (const key of [
    "pallet", "viridian", "pewter", "cerulean", "vermilion", "celadon", "fuchsia", "cinnabar",
  ]) {
    save.regions.kanto.flags[`kanto.fly.${key}`] = true;
  }
  for (const flag of [
    // **カビゴンをどかしておく**（v1.1-c で16番道路に置いた）。
    // 経路探索は条件つきオブジェクトを通れる扱いにするので、
    // 塞がれていることに気づかないまま8枚が16番道路で止まった ――
    // 撮りたいのは町であって、道をふさぐポケモンとの戦いではない
    "kanto.route16.snorlax-woken",
    // **チャンピオンロードのシャッターを開けておく**（v1.1-f）。
    // 押した岩は `world.moved` にしか残らず、撮影の道具は岩を押さない ――
    // 開けておかないと3階へ一生たどり着けない（カビゴンで踏んだのと同じ形）
    "kanto.victory.switch-2f", "kanto.victory.switch-3f",
    // **ふたごじま も岩とスイッチになった**（v1.2-b）。開けておかないと B4F へ行けない
    "kanto.seafoam.switch-b3",
    // **サンアンヌごう のタラップ**（v1.2-b）。ふねのチケットは マサキ がくれるが、
    // 撮影は話しかけられないので、渡した印を立てておく
    "kanto.bill.helped",
    // **グレンジムは ひみつのカギ で開く**（v1.2-b）。
    // カギは やしきの地下にあり、撮影は拾えない ―― 拾った印を立てておく
    "kanto.mansion.secret-key-taken",
    // **ヤマブキジムの前にも警備員が立っている**（v0.12-e）。
    // トキワの `gym-open` は立てていたのに、ヤマブキのぶんを忘れていた ――
    // ジムの扉の真下に立つので、扉の1マス手前で止まる。
    // 撮影が「ヤマブキジム」を撮れなかった本当の理由はこれで、
    // テレポート床とは関係が無かった。
    "kanto.saffron.gym-open",
    // サファリの中に居ることにする（v1.1-h）。ゲートで払わないと入れないので、
    // 撮影は**中に居る状態から始める** ―― 撮りたいのは規則ではなく絵
    "kanto.safari.inside",
    // どうじょうは**勝ったあと**の絵を撮る（v1.1-g-3）。
    // 勝つ前はボールが置かれていないので、部屋が空っぽに写る
    "kanto.dojo.won",
    // ロケット団の筋は**通したあと**を撮る（v1.1-g-3）。
    // ポスターを押していないとアジトは階段ごと無く、部屋が撮れない
    "kanto.rocket.poster-pushed",
    "kanto.rocket.lift-key-taken",
    "kanto.silph.card-key-taken",
    "kanto.field.silph-scope",
    // ナナシマ（v1.1-j）。**乗船の許可**を済ませておく ――
    // 撮影は話しかける仕組みを持たないので、マサキに誘われることができない。
    // 撮りたいのは関門ではなく島の絵
    "kanto.sevii.invited",
    // 4〜7のしま（v1.1-k）。そうこの扉も開けておく
    "kanto.sevii.warehouse-open",
  ]) {
    save.regions.kanto.flags[flag] = true;
  }
  save.regions.kanto.position = { map: "kanto-pallet-town", x: 5, y: 5, facing: "down" };
  save.regions.kanto.money = 3000;
  // **道中のトレーナーに勝てる手持ちにする。**
  // v0.12 で視線が入り、Lv5 のヒトカゲでは2番道路で全滅して
  // 撮影が家に戻されるようになった。撮りたいのはマップなので、勝敗は問わない
  //
  // **PP も尽きないようにする**（v1.1-g-2 で踏んだ）。
  // ダンジョンを足して道中の野生が増えたぶん、素の PP（15/20/25）では
  // 60戦ほどで尽き、わるあがき で自滅して全滅するようになった ――
  // 撮影が「シオンの次」で止まった本当の理由はこれで、
  // *地図が戻るのを待っていなかった*のは、その先の症状でしかなかった。
  //
  // **撮る道具は、負けないようにするのが正しい。** 勝敗は撮る対象ではない。
  for (const mon of Object.values(save.pokemon)) {
    mon.exp = 1250000; // Lv100
    mon.currentHp = 999;
    mon.moves = [
      { id: "brick-break", pp: 99 },
      { id: "bulldoze", pp: 99 },
      { id: "ember", pp: 99 },
    ];
  }
  return save;
})();

const browser = await chromium.launch({ executablePath: CHROME });
const errors = [];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** 撮る場所。名前・説明・行き先。 */
const PLACES = [
  { file: "pallet-town", name: "マサラタウン", note: "家が2軒と、拠点へのゲート", to: ["kanto-pallet-town", 5, 5] },
  { file: "players-house", name: "じぶんの家", note: "屋内。ベッドとテレビ", to: ["kanto-players-house-1f", 3, 3] },
  { file: "oak-lab", name: "オーキド研究所", note: "屋内。机と本棚", to: ["kanto-oak-lab", 4, 5] },
  { file: "route-1", name: "1番道路", note: "草むらと段差", to: ["kanto-route-1", 4, 8] },
  { file: "viridian-city", name: "トキワシティ", note: "ポケモンセンター（赤）とショップ（青）", to: ["kanto-viridian-city", 6, 5] },
  { file: "viridian-gym", name: "トキワジム", note: "ジム8（サカキ）。バッジ7つまで うけつけが通さない", to: ["kanto-viridian-gym", 4, 7] },
  { file: "viridian-center", name: "ポケモンセンター", note: "屋内。カウンターと机", to: ["kanto-viridian-pokecenter", 4, 4] },
  { file: "route-2", name: "2番道路", note: "視線を持つトレーナー。届く範囲が薄く光る", to: ["kanto-route-2", 5, 12] },
  { file: "viridian-forest", name: "トキワの森", note: "木の迷路。視線が2本ある", to: ["kanto-viridian-forest", 5, 12] },
  { file: "pewter-city", name: "ニビシティ", note: "ジム（灰）・博物館・ポケセン・ショップ", to: ["kanto-pewter-city", 7, 11] },
  { file: "pewter-gym", name: "ニビジム", note: "岩とジムトレーナーの視線。奥にタケシ", to: ["kanto-pewter-gym", 4, 7] },
  { file: "mt-moon", name: "おつきみやま", note: "洞窟。曲がり角で視線が切れる", to: ["kanto-mt-moon", 4, 2] },
  { file: "cerulean-city", name: "ハナダシティ", note: "ジム2。町の東に川", to: ["kanto-cerulean-city", 7, 5] },
  { file: "cerulean-gym", name: "ハナダジム", note: "水路で通路が細い。奥にカスミ", to: ["kanto-cerulean-gym", 4, 7] },
  { file: "fuchsia-gym", name: "セキチクジム", note: "見えない壁の迷路。床にしか見えないのにぶつかる（v1.1-g）", to: ["kanto-fuchsia-gym", 4, 9] },
  { file: "cinnabar-gym", name: "グレンジム", note: "クイズ扉。正解するまで開かない条件つきオブジェクト（v1.1-g）", to: ["kanto-cinnabar-gym", 4, 10] },
  { file: "saffron-gym", name: "ヤマブキジム", note: "テレポート床。9つの小部屋は床を踏む以外に行き来できない（v1.1-g）", to: ["kanto-saffron-gym", 6, 7] },
  { file: "vermilion-city", name: "クチバシティ", note: "港町。南が海。ジム3", to: ["kanto-vermilion-city", 7, 7] },
  { file: "lavender-town", name: "シオンタウン", note: "ポケモンタワーのある町。ジムは無い", to: ["kanto-lavender-town", 7, 5] },
  { file: "celadon-city", name: "タマムシシティ", note: "ジム4（エリカ）。カントーで一番大きい町", to: ["kanto-celadon-city", 7, 7] },
  { file: "saffron-city", name: "ヤマブキシティ", note: "**4方向に門がある**（v1.1-d）。カントーの中央", to: ["kanto-saffron-city", 11, 6] },
  { file: "saffron-gate", name: "けんもんじょ", note: "町と道路のあいだに必ず1棟。ポケセンと同じ「2つ warp を持つ小マップ」", to: ["kanto-saffron-gate-north", 3, 2] },
  { file: "underground-path", name: "ちかつうろ", note: "5番⇄6番の**任意の近道**。本道はヤマブキを通る", to: ["kanto-underground-path", 2, 5] },
  { file: "rock-tunnel", name: "イワヤマトンネル", note: "東の腕（v1.1-e）。**いわくだき の野生がここで意味を持つ**", to: ["kanto-rock-tunnel-1f", 6, 7] },
  { file: "route-12", name: "12番道路", note: "シオンの南。海沿いを南へ ―― シオンは行き止まりでなくなった", to: ["kanto-route-12", 5, 5] },
  { file: "mt-moon-b1f", name: "おつきみやま 地下", note: "**3階になった**（v1.1-e）。チャンピオンロードとの使い回しをやめた", to: ["kanto-mt-moon-b1f", 6, 1] },
  { file: "fuchsia-city", name: "セキチクシティ", note: "ジム5（キョウ）。サファリゾーンはまだ閉まっている", to: ["kanto-fuchsia-city", 6, 5] },
  { file: "route-19", name: "19ばんすいどう", note: "なみのり の海。砂州だけが陸", to: ["kanto-route-19", 5, 5] },
  { file: "cinnabar-island", name: "グレンじま", note: "ジム7（カツラ）。なみのり でしか来られない島", to: ["kanto-cinnabar-island", 6, 4] },
  { file: "safari", name: "サファリゾーン", note: "その場所だけの規則（v1.1-h）。歩数・エサ/イシ・戦えない", to: ["kanto-safari-middle", 6, 8] },
  { file: "museum", name: "ニビかがくはくぶつかん", note: "扉だけ繋がっていなかった建物（v1.1-g-3・検証 #115）", to: ["kanto-pewter-museum", 4, 3] },
  { file: "lab", name: "グレンけんきゅうじょ", note: "かせきを もどす唯一の場所（v1.1-g-3）", to: ["kanto-cinnabar-lab", 4, 3] },
  { file: "mansion-celadon", name: "タマムシマンション", note: "イーブイ1匹で、石で分かれる3種が開く（v1.1-g-3）", to: ["kanto-celadon-mansion", 4, 3] },
  { file: "dojo", name: "カラテどうじょう", note: "勝つと どちらか1匹（v1.1-g-3）", to: ["kanto-saffron-dojo", 4, 3] },
  { file: "ss-anne", name: "サンアンヌごう", note: "**船が丸ごと無かった**（v1.2-b）。いあいぎり は町の船長ではなく船長室で教わる", to: ["kanto-ss-anne-1f", 6, 2] },
  // **カギを拾った印を落として撮る。** 立てたままだとカギが消えていて、
  // 「ひみつのカギ はここ」と書いた絵にカギが写らない（v1.2-b）
  { file: "mansion-b1f", name: "ポケモンやしき ちか", note: "**ひみつのカギ** はここ（v1.2-b）。やしきが在る理由そのもの", to: ["kanto-pokemon-mansion-b1f", 6, 3], without: ["kanto.mansion.secret-key-taken"] },
  { file: "cerulean-cave-b1f", name: "ハナダのどうくつ さいしんぶ", note: "ミュウツーを最奥へ戻した（v1.2-b）。1枚だった頃は入口の隣に居た", to: ["kanto-cerulean-cave-b1f", 6, 1] },
  { file: "rock-tunnel-dark", name: "イワヤマトンネル（フラッシュ前）", note: "暗い洞窟（v1.2-a）。見えるのは半径2マス ―― **壁ではなく幕**なので、覚えていなくても歩けるし戦える", to: ["kanto-rock-tunnel-1f", 6, 7], without: ["kanto.ability.flash"] },
  { file: "dept-store", name: "タマムシデパート", note: "品揃えを**階で**分けた（v1.1-i）。2かい どうぐ／3かい わざマシン／4かい しんかの どうぐ", to: ["kanto-celadon-dept-2f", 4, 4] },
  { file: "gamecorner", name: "ゲームコーナー", note: "スロットは作らない ―― 景品はお金で（v1.1-g-3）", to: ["kanto-celadon-gamecorner", 5, 4] },
  { file: "hideout", name: "ロケットだんアジト", note: "サカキ1回目。勝つとシルフスコープ（v1.1-g-3）", to: ["kanto-rocket-b4f", 4, 3] },
  { file: "tower-7f", name: "ポケモンタワー さいじょうかい", note: "v0.12 で送った宿題が、シルフスコープの入手元ができて解けた", to: ["kanto-pokemon-tower-7f", 4, 3] },
  { file: "silph", name: "シルフカンパニー", note: "11階ぶんは作らない ―― 増えるのは枚数だけ（v1.1-g-3）", to: ["kanto-silph-7f", 4, 3] },
  { file: "route-17", name: "サイクリングロード（17ばん）", note: "段差だらけの下り坂。16番とセキチクのあいだ（v1.1-g-2）", to: ["kanto-route-17", 5, 6] },
  { file: "route-24", name: "24ばんどうろ（ナゲツリばし）", note: "ハナダの北。この先は マサキ の家", to: ["kanto-route-24", 5, 4] },
  { file: "power-plant", name: "むじんはつでんしょ", note: "10番道路の北のはずれ。奥に サンダー（v1.1-g-2）", to: ["kanto-power-plant", 6, 5] },
  { file: "seafoam", name: "ふたごじま", note: "19番と20番のあいだの島。地下に フリーザー", to: ["kanto-seafoam-1f", 6, 5] },
  { file: "pokemon-mansion", name: "ポケモンやしき", note: "グレンじまの西。ミュウツー の生まれた場所", to: ["kanto-pokemon-mansion", 6, 5] },
  { file: "cerulean-cave", name: "ハナダのどうくつ", note: "殿堂入りするまで入れない。奥に ミュウツー", to: ["kanto-cerulean-cave", 6, 5] },
  { file: "victory-road", name: "チャンピオンロード", note: "洞窟。かいりき の岩が道を塞ぐ", to: ["kanto-victory-road", 3, 7] },
  // **1階のすぐ後に置く。** どけた岩は `world.cleared` にしか残らず、
  // マップを出入りすると元に戻る（v0.12-d の決定）―― 離すと2階へ行けない
  { file: "victory-road-2f", name: "チャンピオンロード 2階", note: "岩をスイッチに乗せてシャッターを開ける（v1.1-f）", to: ["kanto-victory-road-2f", 5, 4] },
  { file: "victory-road-3f", name: "チャンピオンロード 3階", note: "同じ仕掛けをもう1つ。増えたコードは0行", to: ["kanto-victory-road-3f", 5, 3] },
  { file: "indigo-plateau", name: "セキエイこうげん", note: "ポケモンリーグの入口", to: ["kanto-indigo-plateau", 6, 4] },
  { file: "league-lance", name: "してんのう ワタル", note: "入ったら戻れない部屋。扉は勝つまで開かない", to: ["kanto-league-lance", 4, 5] },
  { file: "sevii-one-island", name: "1のしま", note: "ナナシマの玄関口（v1.1-j）。紫の屋根がネットワークセンター", to: ["kanto-sevii-one-island", 6, 5] },
  { file: "sevii-kindle-road", name: "ほのおのみち", note: "**ポニータ と ギャロップ はここに居る** ―― FRLG で赤緑から移った配置", to: ["kanto-sevii-kindle-road", 6, 6] },
  { file: "sevii-mt-ember", name: "ともしびやま", note: "ブーバー の唯一の居場所。1本道をロケット団2人が塞ぐ", to: ["kanto-sevii-mt-ember", 6, 7] },
  { file: "sevii-ruby-path", name: "ルビーのどうくつ B3F", note: "ルビー と マグカルゴ。地下3階ぶんが公式の階層どおり", to: ["kanto-sevii-ruby-path-b3f", 4, 7] },
  { file: "sevii-bond-bridge", name: "きずなばし", note: "海の上の橋。橋の上でも釣れる（3のしま⇄きのみのもり）", to: ["kanto-sevii-bond-bridge", 6, 6] },
  { file: "sevii-ferry", name: "ふなつきば", note: "港どうしを鎖でつなぐ。**屋内にしたから関門になる**（v1.1-j）", to: ["kanto-sevii-one-ferry", 4, 4] },
  { file: "sevii-icefall", name: "こおりのぬけみち 1F", note: "**氷の床**（v1.1-k）。乗ったら止まれない ―― 一歩＝1マスが崩れる唯一の場所", to: ["kanto-sevii-icefall-1f", 6, 7] },
  { file: "mt-ember-inside", name: "ともしびやま どうくつ", note: "**ファイヤーはここ**（v1.2-b）。島ができるまではチャンピオンロードに居た", to: ["kanto-sevii-mt-ember-inside", 5, 5] },
  { file: "icefall-waterfall", name: "こおりのぬけみち たきつぼ", note: "滝の帯は端から端まで（v1.2-a）。**岸を1マス残すと歩いて回り込める**ので、端まで届かせる", to: ["kanto-sevii-icefall-waterfall", 5, 2] },
  { file: "sevii-ruin-valley", name: "いせきのたに", note: "ネイティ・ヤンヤンマ・ソーナンス。奥に ドットのあな（v1.1-k）", to: ["kanto-sevii-ruin-valley", 6, 6] },
  { file: "sevii-pattern-bush", name: "パターンブッシュ", note: "ヘラクロス・レディバ・イトマル。奥は へんげのどうくつ", to: ["kanto-sevii-pattern-bush", 6, 5] },
  { file: "sevii-sevault", name: "ななしの けいこく", note: "エアームド と ヨーギラス。7のしまの奥（v1.1-k）", to: ["kanto-sevii-sevault-canyon", 6, 9] },
  { file: "sevii-lost-cave", name: "ロストケイブ", note: "原作11室を3枚に畳んだ ―― 出現表は11室とも同じ", to: ["kanto-sevii-lost-cave", 6, 6] },
  { file: "hub-plaza", name: "拠点の広場", note: "施設・大会・保管庫・地方ゲートが並ぶ", to: ["hub-plaza", 8, 9] },
  { file: "hub-depot", name: "保管庫のなか", note: "共通ボックスと BP交換所", to: ["hub-depot", 4, 3] },
];

const shots = [];

/**
 * 画面（マップ以外）も撮る（v0.11.5）。
 *
 * 見た目②で触ったのはバトル画面と UI 全体なので、**マップだけ撮っても分からない。**
 * 撮るのは「1戦の途中」「手持ち」「施設」「カップ」の4枚。
 */
const SCREENS = [
  { file: "battle", name: "バトル", note: "演出つきの1戦。HPバー・タイプ色・技ボタン" },
  { file: "party", name: "てもち", note: "マップから開くパネル" },
  { file: "facility", name: "バトルしせつ", note: "拠点の受付。4施設" },
  { file: "cups", name: "トーナメント", note: "カップ10。タイプ縛りは自分の手持ちで" },
  { file: "fly", name: "そらをとぶ", note: "行き先は「一度でも行った町」だけ並ぶ" },
];

for (const size of [
  { label: "phone", width: 420, height: 900, scale: 2 },
  { label: "wide", width: 900, height: 1000, scale: 2 },
]) {
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(URL);
  await page.waitForSelector("#field-canvas");
  await page.waitForTimeout(900);

  const at = () => page.getAttribute("#field-canvas", "data-at");
  const spot = async () => {
    const [map, pos] = (await at()).split(" ");
    const [x, y] = pos.split(",").map(Number);
    return { map, x, y };
  };

  // ── 撮影用のセーブを読み込む ──
  //
  // 新規データのままだと、**オーキドがマサラタウンの北を塞いでいる**（御三家の前）。
  // 進行を作るために長い台本を書くより、**開通済みのセーブを1つ読ませる**方が
  // 速いし、撮れる絵も「遊んでいる途中」らしくなる。
  /**
   * `without` に挙げたフラグだけ落として読む（v1.2-a）。
   *
   * **撮影のセーブは1つ**で、それが全部の絵の前提になっている。
   * だが1枚だけ「その能力が無い状態」を撮りたいことがある ――
   * イワヤマトンネルは、フラッシュを覚える前と後で別の絵になる。
   * どちらか片方しか撮れないなら、**見るための道具として足りていない。**
   */
  async function loadShootingSave(without = []) {
    const save = JSON.parse(JSON.stringify(SHOOTING_SAVE));
    for (const flag of without) delete save.regions.kanto.flags[flag];
    await page.click("#open-settings");
    await page.waitForSelector("#save-text");
    await page.fill("#save-text", JSON.stringify(save));
    await page.click("#save-import");
    await page.waitForTimeout(800);
    await page.click("#settings-back");
    await page.waitForSelector("#field-canvas");
    await page.waitForTimeout(400);
    // 会話が出ていたら消す
    for (let i = 0; i < 6 && (await page.isVisible("#field-text")); i += 1) {
      await page.keyboard.press("z");
      await page.waitForTimeout(200);
    }
  }
  await loadShootingSave();

  /** 目の前の障害物に フィールド技を使う（v0.12-f）。 */
  async function useAbility(direction) {
    for (let i = 0; i < 2; i += 1) {
      await page.keyboard.press(direction);
      await page.waitForTimeout(220);
    }
    await page.keyboard.press("z");
    await page.waitForTimeout(400);
    for (let i = 0; i < 8 && (await page.isVisible("#field-text")); i += 1) {
      const buttons = await page.$$("#field-text .choices button");
      if (buttons.length > 0) await buttons[0].click();
      else await page.keyboard.press("z");
      await page.waitForTimeout(250);
    }
  }

  /**
   * バトルになったら片付ける。
   *
   * 草むらを通るので**必ずエンカウントする**。逃げられるなら逃げ、
   * だめなら殴って終わらせる ―― 撮りたいのはマップなので、勝敗は問わない。
   */
  /** 地図が見えるようになるまで待つ。戻らなければ false。 */
  async function backOnMap() {
    for (let i = 0; i < 40; i += 1) {
      if (await page.isVisible("#field-canvas")) return true;
      if (await page.isVisible("#field-text")) {
        const buttons = await page.$$("#field-text .choices button");
        if (buttons.length > 0) await buttons[buttons.length - 1].click();
        else await page.keyboard.press("z");
      }
      await page.waitForTimeout(300);
    }
    return false;
  }

  async function clearBattle() {
    if (!(await page.isVisible("#battle"))) return;
    for (let i = 0; i < 60; i += 1) {
      if (await page.isHidden("#battle")) break;
      const run = await page.$("#controls .run");
      if (run !== null) await run.click();
      else {
        const move = await page.$("#controls .move");
        if (move !== null) await move.click();
        else {
          const swap = await page.$("#controls .switch");
          if (swap !== null) await swap.click();
        }
      }
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(700);
    for (let i = 0; i < 20 && (await page.isVisible("#field-text")); i += 1) {
      const buttons = await page.$$("#field-text .choices button");
      if (buttons.length > 0) await buttons[buttons.length - 1].click();
      else await page.keyboard.press("z");
      await page.waitForTimeout(220);
    }
  }

  /** ゲームが次の入力を受け付けるまで待つ（v1.2-a・`playthrough.mjs` と同じ）。 */
  /**
   * 入力を受け付けるまで待つ（v1.2-a / 刻みを詰めたのは v1.2-e）。
   *
   * **刻み 40ms → 8ms、上限 20 → 100**（待てる最大は 800ms のまま）。
   * 40ms 刻みは、62ms で終わるアニメに 1回まるまる払う値段だった。
   * **道具が2本あるなら、直しも2本に要る** ―― 台本と同じ直しをここにも。
   */
  async function ready(limit = 100) {
    for (let i = 0; i < limit; i += 1) {
      const busy = await page.getAttribute("#field-canvas", "data-busy").catch(() => null);
      if (busy !== "1") return;
      await page.waitForTimeout(8);
    }
  }

  async function goTo(map, x, y) {
    // **引き直しは1戦ごとに1回消える。** カントーが広がって
    // クチバからマサラまで歩くようになったので、10回では足りない（v0.12-b）
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const from = await spot();
      if (from.map === map && from.x === x && from.y === y) return true;
      const path = route(from, { map, x, y });
      if (path === null) return false;
      for (const key of path) {
        await page.keyboard.press(key);
        // 先出しの待ち（v1.2-e で 150 → 40）。残りは `ready()` が 8ms 刻みで拾う
        await page.waitForTimeout(40);
        // **ゲームが動き終わるまで待つ**（v1.2-a）。150ms は「1歩ぶんの歩行アニメ」に
        // 合わせた数字で、**氷を滑るあいだ**（1マス55ms × 滑った枚数）も
        // **ぶつかったとき**（110ms）も足りない。足りないと位置が予測とずれ、
        // 60回ぶん経路を引き直して諦める ―― こおりのぬけみち から出られず、
        // その先の12枚が `△` になった。台本が同じことで落ちたときと同じ直し方で、
        // **時間を数えるのをやめて、受け付けているかを読む**
        await ready();
        // **視線バトルは会話から始まる**（v0.12）。会話が開いたままだと
        // 以降のキーは全部そちらに吸われ、歩いていないのに歩いたことになる
        for (let i = 0; i < 8 && (await page.isVisible("#field-text")); i += 1) {
          const buttons = await page.$$("#field-text .choices button");
          if (buttons.length > 0) await buttons[0].click();
          else await page.keyboard.press("z");
          await page.waitForTimeout(200);
        }
        if (await page.isVisible("#battle")) {
          await clearBattle();
          break; // 位置がずれている。引き直す
        }
        // **経路は warp を辿って引いてある**ので、同じマップの中で飛ぶ
        // テレポート床（ヤマブキジム）は、そのまま残りのキーで正しく歩ける。
        // ここで見るのは「別のマップへ出たか」だけでよい。
        //
        // 一度これを座標の突き合わせに変えたが、**歩行アニメの途中では
        // 座標がまだ前のマスのまま**なので毎歩ずれたことになり、
        // 全部の経路を引き直し続けて △ が 1件 → 6件 に増えた（v1.1-g-2）。
        // 精度を上げるなら、比べるタイミングの前提も一緒に見直さないといけない。
        const now = await spot();
        if (now.map !== from.map) break; // 別のマップへ出た。引き直す
      }
      // **歩き終えたことと、着いたことは別。**
      // 向き直りで1歩ぶん食われたり、NPC に塞がれたりすると途中で止まる。
      // ここで確かめずに true を返していたので、
      // 「✓ 1番道路」と言いながらマサラタウンを撮っていた
      const now = await spot();
      if (now.map === map && now.x === x && now.y === y) return true;
    }
    return false;
  }

  /** ゲートを押して答える。**warp ではなくイベント**なので経路探索では跨げない。 */
  async function useGate(direction) {
    await page.keyboard.press(direction);
    await page.waitForTimeout(200);
    await page.keyboard.press(direction);
    await page.waitForTimeout(200);
    await page.keyboard.press("z");
    await page.waitForTimeout(400);
    for (let i = 0; i < 10 && (await page.isVisible("#field-text")); i += 1) {
      const buttons = await page.$$("#field-text .choices button");
      if (buttons.length > 0) await buttons[0].click();
      else await page.keyboard.press("z");
      await page.waitForTimeout(230);
    }
    await page.waitForTimeout(700);
    for (let i = 0; i < 6 && (await page.isVisible("#field-text")); i += 1) {
      await page.keyboard.press("z");
      await page.waitForTimeout(200);
    }
  }

  /** 拠点 → カントー。 */
  async function enterKanto() {
    await goTo("hub-plaza", 8, 13);
    await useGate("ArrowDown");
  }

  /** カントー → 拠点。ゲートの南は海なので北から近づく。 */
  async function backToHub() {
    await goTo("kanto-pallet-town", 9, 10);
    await useGate("ArrowDown");
  }

  // 読み込んだ直後はカントーに居る。拠点の絵はゲートから戻って撮る
  let region = "kanto";
  for (const place of PLACES) {
    const [map, x, y] = place.to;
    const want = map.startsWith("hub-") ? "hub" : "kanto";
    // **リーグの部屋からは歩いて出られない**（v0.12-f・戻る warp が無い）。
    // 次の場所へ動く前に、セーブを読み直してマサラへ戻す。
    // **`want !== region` の判定より先**にやる ―― あとにすると、
    // 出られない部屋から拠点へ歩こうとして失敗したあとに読み直すことになる
    if ((await spot()).map.startsWith("kanto-league-")) {
      await loadShootingSave();
      region = "kanto";
    }
    if (want !== region) {
      if (want === "hub") await backToHub();
      else await enterKanto();
      region = want;
    }
    // **その場所だけ、能力を持たない状態で撮る**（v1.2-a）。
    // 撮り終えたら次の場所の前に読み直す（下の `place.without` の判定）
    if (place.without !== undefined) {
      await loadShootingSave(place.without);
      region = "kanto";
    }
    let ok = await goTo(map, x, y);
    await clearBattle();
    // **撮る前に、地図が戻っているか確かめる**（v1.1-g-2）。
    // ダンジョンを足して野生が増えたぶん、道中で全滅して復活の演出が
    // 長引くことが起きるようになった ―― `#field-canvas` が消えたまま
    // 撮ろうとして道具が落ちた。**道具は落ちるのではなく △ を出す。**
    if (!(await backOnMap())) {
      await loadShootingSave();
      region = "kanto";
      ok = false;
      if (want === "kanto") ok = await goTo(map, x, y);
      await clearBattle();
      await backOnMap();
    }
    const file = `${place.file}-${size.label}.png`;
    await page.locator("#field-canvas").screenshot({ path: join(OUT, file) });
    const where = await at();
    console.log(
      ok
        ? `  ✓ ${place.name}（${size.label}）… ${where}`
        : `  △ ${place.name}（${size.label}）… ねらい ${map} ${x},${y} / いま ${where}`,
    );
    if (size.label === "phone") shots.push({ ...place, group: "マップ", file: place.file });
    // 落としたフラグを戻す。**戻さないと、この先の絵が全部その状態になる**
    if (place.without !== undefined) {
      await loadShootingSave();
      region = "kanto";
    }

    // チャンピオンロードは **かいりき の岩** で北へ抜けられない。
    // 台本と同じで、撮影も能力を使って通る
    if (place.file === "victory-road") {
      // 岩は1階の縦道（1,3）。立てるのは下どなり（1,4）だけ（v1.1-e で作り直した）
      await goTo("kanto-victory-road", 1, 4);
      await useAbility("ArrowUp");
    }
  }

  // ── 画面（マップ以外）──
  const shoot = async (file) => {
    // 画面まるごとは大きいので **CSS ピクセルで撮る**（等倍）。
    // マップは拡大して見たいので canvas だけ 2倍のまま ―― 用途が違う
    await page.screenshot({ path: join(OUT, `${file}-${size.label}.png`), scale: "css" });
  };

  // **そらをとぶ は地方に居るうちに撮る。** 拠点には行き先が無いので、
  // 拠点へ戻ってから開いても「まだ いったことのある まちが ありません」しか写らない
  if (region !== "kanto") {
    await enterKanto();
    region = "kanto";
  }
  await goTo("kanto-celadon-city", 7, 7);
  await clearBattle();
  await page.click("#open-fly").catch(() => {});
  await page.waitForTimeout(600);
  await shoot("fly");
  await page.click("#panel-close").catch(() => {});
  await page.waitForTimeout(400);

  /** 1戦を途中まで進めて撮る。**動いている最中の絵**でないと演出は写らない。 */
  await page.click("#open-settings");
  await page.waitForSelector("#free-battle");
  await page.click("#free-battle");
  await page.waitForTimeout(1500);
  for (let i = 0; i < 6; i += 1) {
    const move = await page.$("#controls .move");
    if (move !== null) await move.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(300);
  await shoot("battle");

  // バトルから抜ける（勝敗がつくまで殴る → もどる）
  // `#settings-back` は**バトル中も DOM に残っている**（隠れているだけ）。
  // `$()` で見ると即座に真になり、殴る前に抜けてしまう ―― 見えるかで判定する
  for (let i = 0; i < 200; i += 1) {
    if (await page.isVisible("#settings-back")) break;
    // **順番が要る。** フリーバトルは終わると「もう いちど / やめる」を出すので、
    // `.again` を先に押すと永久に戦い続ける（実際そうなって撮影が終わらなかった）
    const btn =
      (await page.$("#controls .move")) ??
      (await page.$("#controls .switch")) ??
      (await page.$("#controls .run")) ??
      (await page.$("#controls .again"));
    if (btn !== null) await btn.click().catch(() => {});
    await page.waitForTimeout(220);
  }
  // **1回押しただけでは戻れないことがある。**
  // フリーバトルが終わると設定画面が描き直されるので、
  // その前に「もどる」を押すと、マップの上に設定画面が生え直す
  for (let i = 0; i < 5; i += 1) {
    if (!(await page.isVisible("#settings-back"))) break;
    await page.click("#settings-back").catch(() => {});
    await page.waitForTimeout(700);
  }

  // **抜けられなかったら読み込み直す。**
  // 1戦の長さは乱数しだいで、押し方の工夫では上限を決められない。
  // オートセーブが効いているので、読み直せば拠点から再開できる
  if (!(await page.isVisible("#field-canvas"))) {
    console.log("  ! フリーバトルから戻れないので読み込み直しました");
    await page.goto(URL);
    await page.waitForSelector("#field-canvas");
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(500);

  await clearBattle();
  for (let i = 0; i < 6 && (await page.isVisible("#field-text")); i += 1) {
    await page.keyboard.press("z");
    await page.waitForTimeout(200);
  }
  // 何が出ているか分からないまま落ちると原因が読めないので、名指しで残す
  await page.waitForSelector("#open-box", { state: "visible", timeout: 8000 }).catch(async () => {
    console.log(`  ! てもちボタンが出ない（いま ${await at()} / menu=${(
      (await page.textContent("#menu")) ?? ""
    ).trim().slice(0, 40)}）`);
  });
  await page.click("#open-box");
  await page.waitForTimeout(600);
  await shoot("party");
  await page.click("#panel-close").catch(() => {});
  await page.waitForTimeout(400);

  await goTo("hub-tower", 4, 3);
  await useGate("ArrowUp");
  await page.waitForTimeout(600);
  await shoot("facility");
  await page.click("#screen-back").catch(() => {});
  await page.waitForTimeout(600);

  await goTo("hub-arena", 4, 3);
  await useGate("ArrowUp");
  await page.waitForTimeout(600);
  await shoot("cups");
  await page.click("#screen-back").catch(() => {});
  await page.waitForTimeout(400);

  for (const screen of SCREENS) {
    console.log(`  ✓ ${screen.name}（${size.label}）`);
    if (size.label === "phone") shots.push({ ...screen, group: "画面", to: ["—", 0, 0] });
  }

  await page.close();
}

await browser.close();

writeFileSync(join(OUT, "index.json"), JSON.stringify(shots, null, 2), "utf8");
console.log(`\n  ${shots.length}か所 × 2サイズを ${OUT}/ に置きました。`);
console.log(errors.length === 0 ? "  JS エラーなし" : `  JS エラー ${errors.length} 件:\n${errors.join("\n")}`);
if (errors.length > 0) process.exitCode = 1;
