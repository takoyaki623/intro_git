/**
 * ブラウザで v0.7〜v0.9 の完了条件をひと続きに通す煙テスト。
 *
 *   npm run dev            （別のターミナルで）
 *   npm run playthrough  [-- URL]
 *
 * 単体テスト（packages/core/test/world.test.ts）は同じ道行きを core だけで通す。
 * こちらが見るのは **描画と入力が繋がっているか** ―― 型検査では絶対に落ちない層。
 * 実際、この台本を書いたことで次の2つが見つかった:
 *   - givePokemon の技指定が UI まで届いておらず、覚えていない技で戦っていた
 *   - 家具に囲まれて一生話しかけられない NPC（検証項目 #56 になった）
 */

import { chromium } from "playwright";
import { emptyWorldState, neighborsOf } from "@pkmn/core";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:5173/";
const SHOTS = mkdtempSync(join(tmpdir(), "playthrough-"));
const CHROME = process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium";

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const log = [];
const note = (label, value) => {
  log.push(`${label}: ${value}`);
  console.log(`  ${label}: ${value}`);
};

await page.goto(URL);
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(600);

/** 現在地。field.ts が data-at に書いている（画面には出ない）。 */
const at = () => page.getAttribute("#field-canvas", "data-at");
const talking = () => page.isVisible("#field-text");

async function key(k, n = 1, wait = 200) {
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press(k);
    await page.waitForTimeout(wait);
  }
}
async function clear(limit = 14) {
  for (let i = 0; i < limit && (await talking()); i += 1) {
    await page.keyboard.press("z");
    await page.waitForTimeout(240);
  }
}

/**
 * 会話を最後まで流す。選択肢が出たら**最後の選択肢**を押す。
 * 「おぼえない」「やめる」が最後に来るようにしてあるので、
 * 台本が勝手に手持ちを変えてしまうことがない。
 */
async function drain(limit = 40) {
  for (let i = 0; i < limit; i += 1) {
    if (!(await talking())) return;
    if (await page.isVisible("#field-text .choices")) {
      const buttons = await page.$$("#field-text .choices button");
      await buttons[buttons.length - 1].click();
    } else {
      await page.keyboard.press("z");
    }
    await page.waitForTimeout(230);
  }
}
const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

function expect(label, actual, wanted) {
  const ok = typeof wanted === "function" ? wanted(actual) : actual === wanted;
  note(label, `${actual}${ok ? "" : `  ← 期待と違う (${wanted})`}`);
  if (!ok) process.exitCode = 1;
}

const spot = async () => {
  const [map, pos, facing] = (await at()).split(" ");
  const [x, y] = pos.split(",").map(Number);
  return { map, x, y, facing, raw: `${map} ${pos} ${facing}` };
};

/**
 * 割り込んだバトルを片付けてから戻る（v1.1-a）。
 *
 * `#field-canvas` はバトル中に消える。海に出現表が付いたことで
 * **なみのり の1歩の直後にバトルが割り込む**ようになり、
 * `spot()` が30秒待って落ちた ―― クチバの海には v1.0 まで表が無く、
 * **この道は一度も通っていなかった。**
 *
 * **`spot()` の中でやってはいけない。** 野生戦の回数を数える区間が
 * いくつもあり、そこで黙って戦うと「0回」になって検査が意味を失う
 * （実際1回そうした）。**歩く関数の中だけ**に閉じる。
 */
async function settle() {
  for (let i = 0; i < 4; i += 1) {
    if (await page.isVisible("#field-canvas")) return;
    if (await page.isVisible("#battle")) {
      await fight();
      await page.waitForTimeout(800);
      await drain();
      continue;
    }
    await page.waitForTimeout(400);
  }
}

// ── 経路探索 ──
//
// **押した回数を数える台本は、この規模のマップでは必ず壊れる。**
// 草むらでエンカウントし、木や池で止まり、段差は南にしか降りられない。
// 実際、v0.9 で町を1つ足しただけで、手書きの手順は全部通らなくなった。
// マップデータそのものを読んで経路を出す。
const MAPS = new Map(
  JSON.parse(readFileSync("packages/data/maps.json", "utf8")).map((m) => [m.id, m]),
);
/** core の向き → 押すキー。 */
const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

/**
 * 台本がどけた障害物と、なみのり を覚えたかどうか（v0.12-d）。
 *
 * **経路探索は「今できること」を知らないと役に立たない。**
 * き を切ったのに経路探索が塞がったままだと、
 * ジムに入れたのに「行けない」と報告する台本ができあがる。
 *
 * v1.1-a からは `WorldState` そのものの形で持つ ―― 「隣とは何か」は
 * `neighborsOf` が一手に決めるので、台本は**できることを申告するだけ**でよい。
 */
const cleared = new Set();
let canSurf = false;
const able = () => ({
  ...emptyWorldState(),
  abilities: canSurf ? ["surf"] : [],
  cleared: [...cleared],
});

/**
 * 1歩で行ける先。マップをまたぐ。**規則は core が持っている**（v1.1-a）。
 *
 * 条件つきオブジェクトだけは通れる扱いにする ―― 消える前提のもの
 * （進行を塞ぐオーキドなど）を壁として扱うと本来の道が丸ごと消える。
 * 実際、これで1番道路へ一生行けなかった。条件が残っていれば実際に進めず、
 * `goToMap` が経路を引き直す。
 */
function neighbors(mapId, x, y) {
  return neighborsOf(MAPS.get(mapId), able(), x, y, { ignoreConditional: true }, MAPS).map((n) => ({
    key: KEY[n.dir],
    map: n.map,
    x: n.x,
    y: n.y,
  }));
}

/** 目的地までの手順。マップをまたいで探す。 */
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
        if (step === null || step === undefined) break;
        path.unshift({ key: step.key, node: step.node });
        cur = id(step.from);
      }
      return path;
    }
    for (const next of neighbors(here.map, here.x, here.y)) {
      if (prev.has(id(next))) continue;
      prev.set(id(next), { key: next.key, node: next, from: here });
      queue.push(next);
    }
  }
  return null;
}

/**
 * 目的地まで歩く。マップをまたいでもよい。
 * 途中で野生に会ったら戦い、位置がずれたら経路を引き直す。
 */
/**
 * `tries` は「引き直す回数」。**野生に出くわすたびに1回消える**ので、
 * 洞窟のような長い道では既定では足りない（v0.12-b でおつきみやまが越えられなかった）。
 */
async function goToMap(map, x, y, tries = 20) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await settle();
    const from = await spot();
    if (from.map === map && from.x === x && from.y === y) return from;

    const path = route(from, { map, x, y });
    if (path === null) {
      note("経路なし", `${from.raw} → ${map} ${x},${y}`);
      return from;
    }
    let drifted = false;
    let before = from;
    for (const step of path) {
      await key(step.key, 1, 175);
      // **視線バトルは会話から始まる**（v0.12）。会話が開いたままだと
      // 以降のキーは全部そちらに吸われ、歩いていないのに歩いたことになる
      if (await talking()) {
        await drain();
        await page.waitForTimeout(300);
      }
      if (await page.isVisible("#battle")) {
        await fight();
        await page.waitForTimeout(800);
        await drain();
        drifted = true;
        break;
      }
      await settle();
      const now = await spot();
      // 全滅で飛ばされた・向き直りで進まなかった等。引き直す
      if (now.map !== step.node.map || now.x !== step.node.x || now.y !== step.node.y) {
        // **条件つきのオブジェクトは経路探索では素通りできる**（消える前提）。
        // だが実際には塞いでいるので、ぶつかったら話しかける ―― 人がやることと同じ。
        // v0.12-b でおつきみやまのやまおとこに永久にぶつかり続けて気づいた
        if (now.map === before.map && now.x === before.x && now.y === before.y) {
          await page.keyboard.press("z");
          await page.waitForTimeout(300);
          if (await talking()) await drain();
          if (await page.isVisible("#battle")) {
            await fight();
            await page.waitForTimeout(800);
            await drain();
          }
        }
        drifted = true;
        break;
      }
      before = now;
    }
    if (!drifted) {
      await settle();
      return spot();
    }
  }
  await settle();
  return spot();
}

/** 同じマップの中で歩く。 */
const goTo = async (x, y) => goToMap((await spot()).map, x, y);


/** 選択肢の1つ目を押しながら会話を流す（「はい」側）。 */
async function accept(limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    if (!(await talking())) return;
    const buttons = await page.$$("#field-text .choices button");
    if (buttons.length > 0) await buttons[0].click();
    else await page.keyboard.press("z");
    await page.waitForTimeout(230);
  }
}

/**
 * 目の前の障害物に フィールド技を使う（v0.12-d）。
 * 「つかいますか?」の **はい は先頭**なので `accept()` に任せる。
 */
async function useAbility(direction, key2) {
  await key(direction, 2, 220);
  await key("z", 1, 350);
  note("フィールド技", ((await page.textContent("#field-text")) ?? "（何も出ない）").trim().replace(/\s+/g, " "));
  await accept();
  await clear();
  cleared.add(key2);
}

/** ゲートからカントーへ。**warp ではなくイベント**なので経路探索では跨げない。 */
async function enterKanto() {
  await goToMap("hub-plaza", 8, 13);
  await key("ArrowDown", 2, 200);
  await key("z", 1, 400);
  await accept();
  await page.waitForTimeout(700);
}

/** マサラタウンのゲートから拠点へ戻る。ゲートの南は海なので北から近づく。 */
async function backToHub() {
  await goToMap("kanto-pallet-town", 9, 10);
  await key("ArrowDown", 2, 200);
  await key("z", 1, 400);
  await accept();
  await page.waitForTimeout(700);
}

// ── 0. 拠点（v0.10）──
//
// v0.9 までは家の中から始まり、画面上部のタブで施設へ行けた。
// v0.10 でタブが消え、**拠点マップが起点**になった。
note("開始", await at());
expect("拠点から始まる", (await spot()).map, "hub-plaza");
await clear();
await shot("0-hub");

// 施設の受付。**建物に入って話しかける**形になっている
await goToMap("hub-tower", 4, 3);
expect("バトル施設に 入れた", (await spot()).map, "hub-tower");
await talk("ArrowUp");
await page.waitForTimeout(500);
expect("施設の画面が 開いた", (await page.$("#screen-back")) ? "開いた" : "開かない", "開いた");
// **v0.10 まで、ここに BP交換所が同居していた**（v0.9 のタブの名残）。
// この台本は「同じ画面にある」ことを確かめていた ―― つまり**バグを正解として固定していた。**
// 場所を2つに分けたなら、画面も2つ。ここは「無い」が正しい（v0.11）
// 文字ではなく**買える一覧そのもの**を見る。案内文に「こうかんじょ」の4文字は出る
expect(
  "施設の画面に BP交換所は 無い",
  (await page.$("#bp-shop")) === null ? "ない" : "ある",
  "ない",
);
await shot("0b-facility");
await page.click("#screen-back");
await page.waitForTimeout(500);
expect("マップに もどれた", (await spot()).map, "hub-tower");

// 共通ボックス。**拠点でだけ引き出せる**（capture.md §4.1）
await goToMap("hub-depot", 2, 3);
await talk("ArrowUp");
await page.waitForTimeout(400);
const hubBox = (await page.textContent("#field-panel")) ?? "";
expect("拠点では ほかんこ が開く", hubBox.includes("ほかんこ") ? "開く" : "開かない", "開く");
await page.click("#panel-close");
await page.waitForTimeout(200);

// ── 1. ゲートからカントーへ ──
await enterKanto();
expect("カントーに 入れた", (await spot()).map, "kanto-players-house-1f");
await clear();
await shot("1-house");
await key("ArrowDown", 2, 250);
await page.waitForTimeout(400);
expect("家を出た", await at(), (v) => v.startsWith("kanto-pallet-town"));
await shot("2-town");

// ── 2. 研究所へ。ドアは踏んで入る（v0.8 で interact から step に直した）──
await page.click('#speed button[data-s="logOnly"]');
await goToMap("kanto-oak-lab", 4, 6);
expect("研究所に入った", (await spot()).map, "kanto-oak-lab");

// ── 3. オーキドに話しかけて最初の1匹をもらう ──
await goTo(3, 3);
note("オーキドの前", await at());
// ここは drain（最後の選択肢を押す）を使わない。**選択肢そのものを見る**ため
await key("ArrowRight", 2, 200);
await key("z", 1, 400);
await clear();
const options = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
expect("選択肢", options.join("・"), "フシギダネ・ヒトカゲ・ゼニガメ");
await shot("3-choice");
await page.click("#field-text .choices button:nth-child(2)");
await page.waitForTimeout(300);
await clear();
expect("てもち", (await page.textContent("#field-party")).trim(), (v) => v.startsWith("てもち: ヒトカゲ Lv"));
await shot("4-starter");

// ── 4. ライバル戦（battle コマンドの境界）──
await goTo(7, 4);
note("ライバルの前", await at());
await key("ArrowUp", 2, 200);
await key("z", 1, 400);
await clear();
await page.waitForSelector("#battle:not(.hidden)", { timeout: 5000 });
note("バトル開始", (await page.textContent("#log")).trim().split("\n")[0]);
await shot("5-rival");

/** 攻撃技を優先して押す（最初のボタンが変化技のことがある）。 */
/**
 * 技を選ぶ。**1つずつ順番に押す。**
 *
 * 先頭から押していた頃は、相手に無効な技を延々と撃ち続けた ――
 * ワタル（ひこう5匹中3匹）に じしん を撃って3連敗している。
 * 台本に相性判断を持たせるのは本末転倒なので、**順番に回す。**
 * 4つで型を散らしてあれば、4回に3回は効く技が当たる。
 */
let moveTurn = 0;
async function pickMove() {
  const buttons = await page.$$("#controls .move");
  const usable = [];
  for (const b of buttons) {
    const meta = (await b.textContent()) ?? "";
    if (!meta.includes("— ・")) usable.push(b);
  }
  if (usable.length === 0) return buttons[0];
  moveTurn += 1;
  return usable[moveTurn % usable.length];
}

/**
 * `limit` は「ボタンを押す回数」。ジムリーダーは3〜4体出すので、
 * 80回では殴り切れずに「終わらなかった」と誤報する（v0.12-c で出た）。
 */
async function fight(limit = 240) {
  for (let i = 0; i < limit; i += 1) {
    if (await page.isHidden("#battle")) return "決着してマップに戻った";
    const move = await pickMove();
    if (move) {
      await move.click().catch(() => {});
    } else {
      // **技のボタンが無い場面がある。** ひんしの入れ替え、捕獲の確認、
      // 決着後の後片付け ―― `.switch` だけを見ていたので、そこで止まって
      // 240ターン空回りし、「負けなかった」と誤報していた
      const any = (await page.$$("#controls button"))[0];
      if (any) await any.click().catch(() => {});
    }
    await page.waitForTimeout(200);
  }
  return "終わらなかった";
}
expect("ライバル戦", await fight(), "決着してマップに戻った");
await page.waitForTimeout(700);
await drain();
note("戦闘後のてもち", (await page.textContent("#field-party")).trim());

// ── 5. 1番道路へ出て、草むらで野生に会って逃げる ──
// **ライバル戦は勝てる側に置いた**（v0.12 で測り直した。93〜100%）。
// v0.11 まではヒトカゲを選ぶと 17% しか勝てず、導入戦が壁になっていた。
// 負けると家に戻されるので、今どこに居るかを見てから町へ出る
if ((await spot()).map === "kanto-players-house-1f") {
  note("ライバル戦の結果", "負けて家に戻された（再挑戦できる）");
}
// 1番道路の草むら (3〜5, 12〜13) へ。経路はマップデータから引く
await goToMap("kanto-route-1", 4, 12);
expect("1番道路の くさむらに ついた", (await spot()).map, "kanto-route-1");
note("草むら", await at());
await shot("6-route");

let met = null;
for (let i = 0; i < 30 && met === null; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 2, 200);
  if (await page.isVisible("#battle")) met = (await page.textContent("#log")).trim().split("\n")[0];
}
const hpBefore = (await page.textContent("#field-party")).trim();
expect("野生", met ?? "でなかった", (v) => v.includes("とびだしてきた"));
await shot("7-wild");

const run = await page.$("#controls .run");
expect("にげるボタン", run ? "ある" : "ない", "ある");
if (run) {
  await run.click();
  await page.waitForTimeout(1500);
  await drain();
  expect("にげたあと", (await page.isHidden("#battle")) ? "マップに戻った" : "まだバトル中", "マップに戻った");
}

// ── 6. 野生戦で消耗するか（v0.8 の眼目）──
note("遭遇前のてもち", hpBefore);
// **経験値は画面に出ていない。** 手持ちの行はレベルとHPしか見せないので、
// 無傷で勝ってレベルも上がらなかった1戦は「何も起きなかった」と同じ字面になる。
// 実際それで落ちたので、経験値はセーブから読む（測る対象を合わせる）
const expBefore = await partyExp();
// 1戦では無傷で終わることもある（コラッタが しっぽをふる だけで倒れる等）。
// **戦った跡が手持ちに残るか**を見たいので、変わるまで何戦かする
let battles = 0;
let hpAfter = hpBefore;
// **「1戦した」では足りない。** 逃げられた・変化技しか当たらなかった等で
// 何も残らない1戦がある。**跡が残るまで**戦う（最大4戦）
let expAfter = expBefore;
for (let i = 0; i < 40 && hpAfter === hpBefore && expAfter === expBefore && battles < 4; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 2, 200);
  if (await page.isVisible("#battle")) {
    battles += 1;
    await fight();
    // **戦い終えた直後に見る。** 全滅すると復活地点で全回復するので、
    // 後片付けのあとに見ると「何も起きなかった」と同じ字面になる
    const justAfter = (await page.textContent("#field-party")).trim();
    await page.waitForTimeout(700);
    await drain();
    const settled = (await page.textContent("#field-party")).trim();
    hpAfter = justAfter !== hpBefore ? justAfter : settled;
    expAfter = await partyExp();
  }
}
note("野生と戦った回数", String(battles));
note("たたかった後のてもち", `${hpAfter} / けいけんち ${expBefore} → ${expAfter}`);
expect(
  "戦った跡が手持ちに残る（HPか経験値）",
  hpAfter !== hpBefore || expAfter > expBefore ? "残った" : "残っていない",
  "残った",
);
await shot("8-end");

// ── 6.5 トキワシティ。ショップで買い、道具を使う（v0.9-b の眼目）──

/** その場で向きだけ変えて話しかける。 */
async function talk(direction) {
  await key(direction, 2, 200);
  await key("z", 1, 400);
  await drain();
}

// **演出を短くしてから歩き出す。**
// カントーが53枚になって完走が20分を超えたので、台本は高速モードで走る。
// 飛ばしても結果が変わらないことは core の分担が保証している（ui-flow.md §4）
await page.click("#speed button[data-s=\"fast\"]");
await page.waitForTimeout(200);

await drain();
await goToMap("kanto-viridian-city", 5, 4);
expect("トキワシティに ついた", (await spot()).map, "kanto-viridian-city");
await shot("9-viridian");

// ポケモンセンター。入口は (5,3)、中の到着地点は (4,6)
await goToMap("kanto-viridian-pokecenter", 4, 3);
expect("ポケモンセンターに 入った", (await spot()).map, "kanto-viridian-pokecenter");
await talk("ArrowUp");
expect(
  "ジョーイさんが 回復してくれた",
  (await page.textContent("#field-party")).trim(),
  (v) => /(\d+)\/\1$/.test(v),
);
await shot("10-center");

// ショップ。カウンターごしに店員 (2,2) へ話しかける
await goToMap("kanto-viridian-mart", 3, 2);
expect("ショップに 入った", (await spot()).map, "kanto-viridian-mart");
await key("ArrowLeft", 2, 200);
await key("z", 1, 400);
await clear();

const shelf = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
note("しなぞろえ", shelf.join(" / "));
expect("値段つきで 並んだ", shelf[0] ?? "（出ていない）", (v) => v.includes("円"));
await shot("11-shop");

// キズぐすりを買って「やめる」
const potionIndex = shelf.findIndex((t) => t.includes("キズぐすり"));
expect("キズぐすりが 売っている", potionIndex >= 0 ? "ある" : "ない", "ある");
await page.click(`#field-text .choices button:nth-child(${potionIndex + 1})`);
await page.waitForTimeout(400);
await clear(4);
const remaining = await page.$$("#field-text .choices button");
if (remaining.length > 0) await remaining[remaining.length - 1].click();
await drain();

// バッグに入り、お金が減ったか
await page.click("#open-bag");
await page.waitForTimeout(300);
const bag = (await page.textContent("#field-panel")) ?? "";
expect("バッグに キズぐすり が ある", bag.includes("キズぐすり") ? "ある" : "ない", "ある");
expect("おかねが 減った", bag.includes("3000円") ? "減っていない" : "減った", "減った");
await shot("12-bag");
await page.click("#panel-close");
await page.waitForTimeout(200);

// ── 7. リロードしても続きから遊べるか（v0.9 の眼目）──
// **セーブが効いているかは、型検査でもユニットテストでも絶対に落ちない。**
// 実際にタブを開き直して、同じ場所・同じ手持ちで始まることを確かめる
const beforeReload = { at: await at(), party: (await page.textContent("#field-party")).trim() };
await page.reload();
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(900);
expect("リロードしても同じ場所", await at(), beforeReload.at);
expect("リロードしても同じ手持ち", (await page.textContent("#field-party")).trim(), beforeReload.party);
await shot("9-reloaded");

// ── 8. セーブ画面。書き出したものが読み戻せるか ──
await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const exported = await page.inputValue("#save-text");
expect("書き出せた", exported.length > 200 ? "JSON が出た" : `短すぎる (${exported.length})`, "JSON が出た");
expect(
  "書き出しに手持ちが入っている",
  /"partyUids":\s*\[\s*"/.test(exported) ? "入っている" : "入っていない",
  "入っている",
);
await shot("10-save");

// 別の場所へ歩いてから、書き出したものを読み戻して元に戻るか
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(300);
// **動いていなければ、読み戻しの検査は何も確かめていない。**
// 草むらの中を左右に振って、必ず違う場所に立ってから読み戻す
let moved = await at();
for (let i = 0; i < 6 && moved === beforeReload.at; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 2, 200);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(700);
    await drain();
  }
  moved = await at();
}
expect("読み戻す前に、ちゃんと べつの ばしょに いる", moved === beforeReload.at ? "同じ" : "ちがう", "ちがう");
await page.click("#open-settings");
await page.waitForSelector("#save-text");
await page.fill("#save-text", exported);
await page.click("#save-import");
await page.waitForTimeout(900);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(400);
note("読み戻す前に歩いた先", moved);
expect("読み戻すと元の場所に戻る", await at(), beforeReload.at);
await shot("11-imported");

// ── 9. BP交換所と持ち物（v0.9-c の眼目）──
//
// BP は施設を遊んで貯めるものなので、台本では**セーブを書き換えて**用意する。
// エクスポート／インポートが本当に往復していることの確認にもなっている。
await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const cheat = JSON.parse(await page.inputValue("#save-text"));
cheat.global.bp = 100;
await page.fill("#save-text", JSON.stringify(cheat));
await page.click("#save-import");
await page.waitForTimeout(900);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(400);

// 施設は拠点にある。**ゲートを通らないと行けない**（v0.10 でタブが消えた）
await backToHub();
expect("ゲートで 拠点に もどれた", (await spot()).map, "hub-plaza");
// **BP交換所は保管庫にある**（v0.11 で施設から分けた）
await goToMap("hub-depot", 6, 3);
await talk("ArrowUp");
await page.waitForSelector("#bp-shop");
expect(
  "こうかんじょから 連戦は 始められない",
  ((await page.textContent("#menu")) ?? "").includes("バトルタワー") ? "始められる" : "始められない",
  "始められない",
);
const shopText = (await page.textContent("#bp-shop")) ?? "";
expect("BP交換所に たべのこし が ある", shopText.includes("たべのこし") ? "ある" : "ない", "ある");
expect(
  "おかねで 買える どうぐは 並ばない",
  shopText.includes("キズぐすり") ? "並んでいる" : "並ばない",
  "並ばない",
);
await page.click('[data-bp="leftovers"]');
await page.waitForTimeout(900);
const bpAfter = (await page.textContent("#menu")) ?? "";
expect("BP が 減った", bpAfter.includes("BP: 100") ? "減っていない" : "減った", "減った");
await shot("13-bp");

// 持ち物を持たせる（v0.5 から動いていた機構が、本編で初めて届く）。
// **手持ちはカントーに居る。** 拠点の手持ちは空なので、ゲートを通って戻る
await page.click("#screen-back");
await page.waitForTimeout(500);
await enterKanto();
expect("カントーに もどれた", (await spot()).map, (v) => v.startsWith("kanto-"));
await page.click("#open-box");
await page.waitForTimeout(300);
await page.click("[data-hold]");
await page.waitForTimeout(400);
const holdOptions = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
note("もたせられる どうぐ", holdOptions.join(" / "));
const leftoversIndex = holdOptions.findIndex((t) => t.includes("たべのこし"));
expect("たべのこしを もたせられる", leftoversIndex >= 0 ? "できる" : "できない", "できる");
await page.click(`#field-text .choices button:nth-child(${leftoversIndex + 1})`);
await page.waitForTimeout(400);
await drain();
await page.waitForTimeout(400);
const partyPanel = (await page.textContent("#field-panel")) ?? "";
expect("てもちに もちものが 出る", partyPanel.includes("たべのこし") ? "出る" : "出ない", "出る");
await shot("14-hold");
await page.click("#panel-close");
await page.waitForTimeout(200);

// ── 10. 全滅したら復活地点へ戻る（v0.9-c）──
//
// **どこへ戻るかはセーブに入っている。** 家ではなく、最後に回復した場所。
await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const weak = JSON.parse(await page.inputValue("#save-text"));
// HP を1にするだけでは**勝ってしまうことがある**（先制して倒せば負けない）。
// 攻撃技を取り上げて、**勝ちようが無い状態**にする ――
// ここで確かめたいのは「負けたとき何が起きるか」であって、勝敗の運ではない
for (const mon of Object.values(weak.pokemon)) {
  mon.currentHp = 1;
  mon.moves = [{ id: "growl", pp: 40 }];
}
const respawn = weak.regions.kanto.respawn;
note("セーブに入っている 復活地点", `${respawn.map} ${respawn.x},${respawn.y}`);
expect("復活地点は ポケモンセンター", respawn.map, "kanto-viridian-pokecenter");
await page.fill("#save-text", JSON.stringify(weak));
await page.click("#save-import");
await page.waitForTimeout(900);

await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(300);
// 1番道路の草むらへ戻り、負けるまで戦う
await goToMap("kanto-route-1", 4, 3);
// HP1 でも勝ってしまうことがある（相手が変化技しか撃たない等）。
// **負けるまで粘る**ので、歩数は多めに取る
let lost = false;
for (let i = 0; i < 80 && !lost; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 1, 170);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(800);
    await drain();
    // **1回見て終わりにしない。** 全滅のあとは会話とマップ移動が続くので、
    // 800ms 後に覗くと、まだ道路に立っている瞬間を掴むことがある
    // ―― これで「負けなかった」と誤報していた
    for (let w = 0; w < 40 && !lost; w += 1) {
      lost = (await spot()).map === respawn.map;
      if (!lost) {
        await drain(4);
        await page.waitForTimeout(300);
      }
    }
  }
}
expect("全滅したら 復活地点に 戻る", lost ? "戻った" : "負けなかった", "戻った");
if (lost) {
  const at2 = await spot();
  expect("戻った ざひょう", `${at2.x},${at2.y}`, `${respawn.x},${respawn.y}`);
  expect(
    "ポケモンは 全回復している",
    (await page.textContent("#field-party")).trim(),
    (v) => /(\d+)\/\1$/.test(v),
  );
}
await shot("15-blackout");

// ── 11. 拠点と地方を往復しても、進行が混ざらない（v0.10 の眼目）──
//
// **地方の進行は地方に、共通ボックスは拠点に。** 行き来しても混ざらない。
// **出るときの場所が保存される。** 記録するのはゲートの前まで歩いた後
await goToMap("kanto-pallet-town", 9, 10);
const beforeTrip = { at: await at(), party: (await page.textContent("#field-party")).trim() };
await backToHub();
expect("拠点に もどれた", (await spot()).map, "hub-plaza");
expect(
  "拠点では 手持ちが 空",
  (await page.textContent("#field-party")).trim(),
  "てもち なし",
);
await enterKanto();
// 向きは比べない。ゲートに向き直ってから出るので、保存されるのは「下向き」になる
const place = (raw) => raw.split(" ").slice(0, 2).join(" ");
expect("カントーの 続きから 始まる", place(await at()), place(beforeTrip.at));
expect("手持ちも そのまま", (await page.textContent("#field-party")).trim(), beforeTrip.party);
await shot("16-roundtrip");

// ── 12. 視線・ジム・バッジ（v0.12 の眼目）──
//
// **セーブを作って始める。** ここで確かめたいのは
// 「視線に入ると戦いになり、勝つと消え、ジムでバッジが手に入る」という機構で、
// そこまで歩いて育てる過程ではない（過程は 1〜11 で確かめている）。
await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const forGym = JSON.parse(await page.inputValue("#save-text"));
forGym.regions.kanto.position = { map: "kanto-viridian-city", x: 6, y: 3, facing: "up" };
// **レベルを上げるだけでは足りなかった。**
// Lv50 のヒトカゲでも、ひっかく と ひのこ では イワーク（ぼうぎょ160・
// ほのおは半減）を削り切れず、実際に全滅して復活地点へ飛ばされた。
// 相性を確かめたいのではなく機構を確かめたいので、通る技を持たせる
// ―― ゲーム内の子どもが言っている「くさか みずの わざが あれば ラク」そのもの
for (const mon of Object.values(forGym.pokemon)) {
  mon.exp = 125000;
  mon.currentHp = 999;
  mon.moves = [
    { id: "brick-break", pp: 15 },
    { id: "bulldoze", pp: 20 },
    { id: "ember", pp: 25 },
  ];
}
await page.fill("#save-text", JSON.stringify(forGym));
await page.click("#save-import");
await page.waitForTimeout(900);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(400);
await drain();

// 警備員は (6,1)。真下はポケモンセンターの壁なので、右から話しかける
await goToMap("kanto-viridian-city", 7, 1);
await talk("ArrowLeft");
await drain();
await goToMap("kanto-route-2", 5, 12);
expect("警備員に 話すと 北が ひらく", (await spot()).map, "kanto-route-2");

// 視線に踏み込む。
// **goToMap は道中のバトルを勝手に片付ける**ので、視線の手前まで行って
// そこから自分で1歩踏み込む（でないと「入った瞬間」を掴めない）
await goToMap("kanto-route-2", 5, 11);
note("視線の手前", await at());
// 「！」は押さなくても消える（v0.12）ので、その時間ぶん待つ
await key("ArrowUp", 1, 1400);
// **話しかけていないのに向こうから始まる**のが視線。まず会話が開く
expect("視線に 入ると むこうから しかけてくる", (await talking()) ? "しかけてきた" : "なにも起きない", "しかけてきた");
await drain();
await page.waitForTimeout(400);
expect("そのまま しょうぶに なる", (await page.isVisible("#battle")) ? "なった" : "ならない", "なった");
expect("視線バトルの 決着", await fight(), "決着してマップに戻った");
await page.waitForTimeout(700);
await drain();
await shot("17-sight");

// **倒したトレーナーは消える。** 消えないと同じ相手と無限に戦える
await goToMap("kanto-route-2", 5, 11);
await key("ArrowUp", 1, 400);
expect(
  "倒した あとは 視線に 入っても 起きない",
  (await page.isVisible("#battle")) ? "また戦いになる" : "起きない",
  "起きない",
);
await drain();

// 森を抜けてニビジムへ
await goToMap("kanto-pewter-city", 5, 8);
expect("トキワの森を ぬけて ニビに つく", (await spot()).map, "kanto-pewter-city");
await goToMap("kanto-pewter-gym", 4, 8);
expect("ジムに 入れる", (await spot()).map, "kanto-pewter-gym");

// ジムトレーナーは視線で捕まえてくる。goToMap が道中で片付けてくれる
await goToMap("kanto-pewter-gym", 4, 3);
note("ジムの中", await at());
await goToMap("kanto-pewter-gym", 4, 2);
expect("タケシの まえに 立てる", await at(), (v) => v.startsWith("kanto-pewter-gym 4,2"));
await talk("ArrowUp");
await drain(8);
expect("タケシに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
expect("ジムリーダー戦の 決着", await fight(), "決着してマップに戻った");
await page.waitForTimeout(800);
await drain(30);
note("タケシ戦のあと", `${await at()} / ${(await page.textContent("#field-party")).trim()}`);
await shot("18-badge");

await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const afterGym = JSON.parse(await page.inputValue("#save-text"));
expect("バッジが セーブに 入る", afterGym.regions.kanto.badges, 1);
expect("タケシ撃破が 記録される", afterGym.regions.kanto.flags["kanto.pewter.brock-beaten"], true);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");

// ── 13. ハナダ・クチバまで通す（v0.12-b の眼目）──
//
// **ここはコードを1行も足していない区間。** 町を2つとジムを2つ、
// データだけで足せたかどうかを、実際に歩いて確かめる。
await goToMap("kanto-cerulean-gym", 4, 8, 60);
expect("ハナダジムまで 行ける", (await spot()).map, "kanto-cerulean-gym");
await goToMap("kanto-cerulean-gym", 4, 2);
await talk("ArrowUp");
await drain(8);
expect("カスミに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
expect("カスミ戦の 決着", await fight(), "決着してマップに戻った");
await page.waitForTimeout(800);
await drain(30);
await shot("19-misty");

// **バッジの数でショップの品揃えが変わる**（イベントの if だけで作った）
// 店員は (2,2)。真下から話しかける。
// **`talk()` は使わない** ―― あれは最後に `drain()` するが、`drain()` は
// 選択肢の**いちばん下**（＝「やめる」）を押すので、開いた瞬間に店を閉じてしまう。
// 品揃えは `#menu` ではなく**会話枠の選択肢**として出る（field.ts の openShop）
await goToMap("kanto-cerulean-mart", 2, 3, 40);
note("ショップの前", await at());
await key("ArrowUp", 2, 200);
await key("z", 1, 400);
for (let i = 0; i < 4 && !(await page.isVisible("#field-text .choices")); i += 1) {
  await page.keyboard.press("z");
  await page.waitForTimeout(260);
}
const badgeShelf = (await page.textContent("#field-text")) ?? "";
note("ショップの品ぞろえ", badgeShelf.trim().replace(/\s+/g, " ").slice(0, 100));
expect(
  "バッジ2つで いい ボールが ならぶ",
  badgeShelf.includes("スーパーボール") ? "ならんだ" : "ならばない",
  "ならんだ",
);
expect(
  "バッジ4つの しなは まだ ならばない",
  badgeShelf.includes("ハイパーボール") ? "ならんでいる" : "ならばない",
  "ならばない",
);
await shot("20-badge-shop");
await drain();

// クチバ ―― **ジムの前に き がある**（v0.12-d）。
// 進行能力が本当に進行を止めているかは、止まってみないと分からない
// **き の真下は海。** 立てるのは右どなりだけ（左どなりには看板がある）
await goToMap("kanto-vermilion-city", 6, 10, 60);
expect("クチバまで 行ける", (await spot()).map, "kanto-vermilion-city");
expect(
  "いあいぎり が 無いと ジムに 入れない",
  (await goToMap("kanto-vermilion-gym", 4, 8, 4)).map,
  "kanto-vermilion-city",
);

// せんちょうに おそわる（道具ではなくフラグ・world.md §7）
await goToMap("kanto-vermilion-city", 3, 5, 30);
await talk("ArrowUp");
await drain(8);
await goToMap("kanto-vermilion-city", 6, 10, 30);
await useAbility("ArrowLeft", "kanto-vermilion-city:vermilion-tree");
note("き を きったあと", await at());
await shot("20b-cut");

await goToMap("kanto-vermilion-gym", 4, 8, 60);
expect("いあいぎり で ジムに 入れる", (await spot()).map, "kanto-vermilion-gym");
await goToMap("kanto-vermilion-gym", 4, 2);
await talk("ArrowUp");
await drain(8);
expect("マチスに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
expect("マチス戦の 決着", await fight(), "決着してマップに戻った");
await page.waitForTimeout(800);
await drain(30);

await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const threeBadges = JSON.parse(await page.inputValue("#save-text"));
expect("バッジが 3つに なる", threeBadges.regions.kanto.badges, 3);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await shot("21-three-badges");

// ── 14. タマムシ・セキチク・ヤマブキ（v0.12-c）──
//
// **ジムの順番をイベントの条件だけで縛れているか**を確かめる区間。
// ナツメ（ジム6）はバッジ5つまで挑めない ―― 警備員が通さない。
// **ここから相手が Lv37〜43 になる。** §12 で持たせた技（かくとう・じめん・ほのお）では
// キョウの ベトベトン と マタドガス を削り切れず、実際に負けて連鎖で全部落ちた。
// 台本は機構を確かめるものなので、通る技に入れ替える
/**
 * 後半のジムに勝てる状態へ戻す。
 *
 * **PP は歩いているうちに尽きる。** 1回だけ強化して3つのジムを回った版は、
 * 道中の野生戦で技を使い切り、わるあがき でキョウに負けて、
 * そこから先の判定が全部連鎖で崩れた。台本が確かめたいのは機構なので、
 * **ジムの直前ごとに満タンに戻す**（人で言えば「ちゃんと準備してから行く」）。
 */
/** セーブを読み出す。画面に出ていない値（経験値など）はここからしか見えない。 */
async function readSave() {
  await page.click("#open-settings");
  await page.waitForSelector("#save-export");
  await page.click("#save-export");
  const save = JSON.parse(await page.inputValue("#save-text"));
  await page.click("#settings-back");
  await page.waitForSelector("#field-canvas");
  await page.waitForTimeout(300);
  return save;
}

async function badgeCount() {
  return (await readSave()).regions.kanto.badges;
}

/** 手持ちの経験値の合計。 */
async function partyExp() {
  const save = await readSave();
  return save.regions.kanto.partyUids.reduce((sum, uid) => sum + save.pokemon[uid].exp, 0);
}

async function powerUp() {
  await page.click("#open-settings");
  await page.waitForSelector("#save-export");
  await page.click("#save-export");
  const save = JSON.parse(await page.inputValue("#save-text"));
  for (const mon of Object.values(save.pokemon)) {
    mon.exp = 1250000; // Lv100（900000 は Lv94 で、キョウの どくどく に押し切られた）
    mon.currentHp = 999;
    mon.status = null;
    // **1つめは「無効になりえない技」にする。**
    // `pickMove()` は PP の残っている先頭の技を押し続けるだけなので、
    // 相手に無効な技を先頭に置くと、そのまま0ダメージを撃ち続けて負ける。
    // 実際、じしん（ひこうに無効）を先頭にしていてワタルに3連敗した。
    //   あく … 無効になる相手が居ない
    //   いわ … 無効になる相手が居ない
    //   じしん … ひこうに無効 ／ でんき … じめんに無効
    // **とくしゅ技で揃える。** ヒトカゲの最終形は こうげき 84 / とくこう 109 で、
    // 物理技で殴っていたぶんだけ損をしていた。型は4つに散らす（`pickMove` が順に回す）
    mon.moves = [
      { id: "flamethrower", pp: 15 }, // くさ・こおり・むしに2倍（タイプ一致）
      { id: "ice-beam", pp: 10 }, // ドラゴン・ひこう・じめん・くさに2倍
      { id: "thunderbolt", pp: 15 }, // みず・ひこうに2倍
      { id: "psychic", pp: 10 }, // どく・かくとうに2倍
    ];
  }
  // **手持ちを6匹にする。**
  // 1匹だと、キョウの どくどく + えんまく で削り切られて負けた。
  // 3匹にしても、四天王カンナ（5匹・みず/こおり）に3回とも負けた。
  // 台本が確かめたいのは機構であって腕前ではないので、正面から揃える ――
  // 人がやることと同じ
  const party = save.regions.kanto.partyUids;
  const first = save.pokemon[party[0]];
  while (party.length < 6) {
    const uid = `f${party.length}`.padEnd(16, "0");
    save.pokemon[uid] = { ...structuredClone(first), uid };
    party.push(uid);
  }
  await page.fill("#save-text", JSON.stringify(save));
  await page.click("#save-import");
  await page.waitForTimeout(900);
  await page.click("#settings-back");
  await page.waitForSelector("#field-canvas");
  await page.waitForTimeout(400);
  await drain();
}

await powerUp();

await goToMap("kanto-saffron-city", 5, 8, 80);
expect("ヤマブキまで 行ける", (await spot()).map, "kanto-saffron-city");
await talk("ArrowUp");
await drain(6);
await goToMap("kanto-saffron-city", 5, 8, 20);
expect(
  "バッジ3つでは ヤマブキジムに 入れない",
  (await goToMap("kanto-saffron-gym", 4, 8, 6)).map,
  "kanto-saffron-city",
);
await shot("22-saffron-closed");

await powerUp();
/**
 * ジムに挑んで、バッジが増えるまでやり直す。
 *
 * **負けることは異常ではない。** 台本の手持ちを Lv94 × 3匹にしてもキョウに負けた ――
 * どくどく + えんまく は、レベル差では解けない組み合わせだから。
 * 人がやることと同じで、全回復してもう一度行く。
 * ここで確かめたいのは「勝てるか」ではなく「勝つとバッジが増えるか」。
 */
async function challengeGym(label, map, x, y, want) {
  // **5回まで。** 台本の戦い方は「上から順に技を押す」だけなので、
  // えんまく で命中を下げてくる相手には素で負ける（キョウで3連敗した）
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await powerUp();
    await goToMap(map, x, y, 80);
    if ((await spot()).map !== map) {
      note(`${label}`, `ジムに 入れない（いま ${await at()}）`);
      return 0;
    }
    await talk("ArrowUp");
    await drain(8);
    if (await page.isVisible("#battle")) {
      await fight();
      await page.waitForTimeout(800);
      await drain(30);
    }
    const badges = await badgeCount();
    if (badges >= want) return attempt;
    note(`${label}`, `${attempt}回目は 負けた（バッジ ${badges}）`);
  }
  return 0;
}

// エリカ（ジム4）
expect(
  "エリカに 勝つと バッジが 4つに なる",
  await challengeGym("エリカ", "kanto-celadon-gym", 4, 2, 4),
  (v) => v > 0,
);

// ── 15.5 道具が個体を書き換える（v1.1-b）──
//
// **わざマシンも進化の石も、世界のコードを1行も足さずに動く**はずのもの。
// だから確かめるのは効果ではなく、**選ばせているか**と**やめたら減らないか。**
// タマムシに居るこの時点でやる ―― しんかの どうぐ の店がここにある。
{
  /**
   * バッグを開く。**「押す」ではなく「開いていることにする」。**
   *
   * `#open-bag` は開閉の切り替えで、道具を使うとパネルが開いたまま描き直される。
   * そこでもう一度押すと**閉じる** ―― 台本は空のパネルを読んで
   * 「わざマシンが 0こ になった」と誤報した（実際は減っていない）。
   */
  const openBag = async () => {
    if (!(await page.isVisible("#field-panel"))) await page.click("#open-bag");
    await page.waitForTimeout(300);
  };
  /** パネルは歩く前に閉じる（開いたままだと画面を覆っている）。 */
  const closeBag = async () => {
    if (await page.isVisible("#field-panel")) await page.click("#panel-close");
    await page.waitForTimeout(200);
  };

  // タケシがくれた わざマシン（がんせきふうじ）。原作どおり、ジムの報酬で手に入る
  await openBag();
  const bagText = (await page.textContent("#field-panel")) ?? "";
  expect(
    "ジムでもらった わざマシンが バッグに ある",
    bagText.includes("わざマシン39") ? "ある" : "ない",
    "ある",
  );

  /** バッグの中の個数。減った／減っていないを数える。 */
  const countOf = async (label) => {
    const text = (await page.textContent("#field-panel")) ?? "";
    const hit = new RegExp(`${label}[^0-9]*(\\d+)こ`).exec(text);
    return hit === null ? 0 : Number(hit[1]);
  };
  const before = await countOf("わざマシン39");

  // 1回目 ―― **「おぼえない」を選ぶ。** 取り返しのつかない操作なので、
  // やめたときに道具が消えてはいけない
  await page.click('[data-use="tm39"]');
  await page.waitForTimeout(400);
  await page.click("#field-text .choices button:nth-child(1)"); // 1匹目に使う
  await page.waitForTimeout(400);
  await clear(4);
  const slots = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
  expect(
    "4つ埋まっていたら わすれる技を えらばせる",
    slots.length >= 5 ? `${slots.length}つ（技4＋やめる）` : `${slots.length}つ`,
    (v) => v.startsWith("5"),
  );
  await page.click(`#field-text .choices button:nth-child(${slots.length})`); // 「おぼえない」
  await page.waitForTimeout(500);
  await drain();
  await openBag();
  expect("やめたら わざマシンは 減らない", await countOf("わざマシン39"), before);

  // 2回目 ―― 実際に入れ替える
  await page.click('[data-use="tm39"]');
  await page.waitForTimeout(400);
  await page.click("#field-text .choices button:nth-child(1)");
  await page.waitForTimeout(400);
  await clear(4);
  await page.click("#field-text .choices button:nth-child(1)"); // 1つめの技を忘れる
  await page.waitForTimeout(600);
  await drain();
  const taught = await readSave();
  const learned = Object.values(taught.pokemon).some((m) =>
    m.moves.some((x) => x.id === "rock-tomb"),
  );
  expect("わざマシンで 技を おぼえた", learned ? "おぼえた" : "おぼえていない", "おぼえた");

  // しんかの どうぐ の店（原作のデパート4階にあたる）
  await closeBag();
  await goToMap("kanto-celadon-mart", 5, 2, 60);
  expect("タマムシの 店に 入れた", (await spot()).map, "kanto-celadon-mart");
  await key("ArrowUp", 2, 200);
  await key("z", 1, 400);
  await clear();
  const stones = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
  note("しんかの どうぐ", stones.slice(0, 4).join(" / "));
  expect(
    "つながりのヒモが 売っている",
    stones.some((t) => t.includes("つながりのヒモ")) ? "ある" : "ない",
    "ある",
  );
  await page.click(`#field-text .choices button:nth-child(${stones.length})`); // やめる
  await drain();

  // **石とヒモの相手を用意する。** 手持ちはヒトカゲの系統しか居ないので、
  // BP と同じやり方でセーブを書き換える（台本が確かめたいのは機構）
  await page.click("#open-settings");
  await page.waitForSelector("#save-export");
  await page.click("#save-export");
  const save = JSON.parse(await page.inputValue("#save-text"));
  const uids = save.regions.kanto.partyUids;
  save.pokemon[uids[0]].species = "pikachu";
  save.pokemon[uids[0]].ability = "static";
  save.pokemon[uids[1]].species = "machoke";
  save.pokemon[uids[1]].ability = "guts";
  save.global.bag = { ...save.global.bag, "thunder-stone": 1, "linking-cord": 1 };
  await page.fill("#save-text", JSON.stringify(save));
  await page.click("#save-import");
  await page.waitForTimeout(900);
  await page.click("#settings-back");
  await page.waitForSelector("#field-canvas");
  await page.waitForTimeout(400);

  /** 道具を1匹目に使い、出た選択肢の1つ目を押す（「しんかさせる」）。 */
  const useOnFirst = async (id, member) => {
    await openBag();
    await page.click(`[data-use="${id}"]`);
    await page.waitForTimeout(400);
    await page.click(`#field-text .choices button:nth-child(${member})`);
    await page.waitForTimeout(400);
    await clear(4);
    await page.click("#field-text .choices button:nth-child(1)");
    await page.waitForTimeout(700);
    await drain();
  };

  await useOnFirst("thunder-stone", 1);
  const evolved = await readSave();
  expect(
    "かみなりのいしで ライチュウに なる",
    evolved.pokemon[uids[0]].species,
    "raichu",
  );

  await useOnFirst("linking-cord", 2);
  const traded = await readSave();
  expect(
    "つながりのヒモで ゴーリキーが カイリキーに なる",
    traded.pokemon[uids[1]].species,
    "machamp",
  );
  await closeBag();
  await shot("22b-items");
}

// キョウ（ジム5）。**ジムの前にポケモンセンターへ寄る** ―― 人がやることと同じ
await goToMap("kanto-fuchsia-pokecenter", 4, 3, 80);
await talk("ArrowUp");
await drain();
expect(
  "キョウに 勝つと バッジが 5つに なる",
  await challengeGym("キョウ", "kanto-fuchsia-gym", 4, 2, 5),
  (v) => v > 0,
);
await shot("23-five-badges");

// バッジ5つになったので、警備員が通す
await goToMap("kanto-saffron-city", 5, 8, 80);
await talk("ArrowUp");
await drain(6);
await goToMap("kanto-saffron-city", 5, 8, 40);
await talk("ArrowUp");
await drain(6);
expect(
  "バッジ5つで ヤマブキジムに 入れて、勝つと 6つに なる",
  await challengeGym("ナツメ", "kanto-saffron-gym", 4, 2, 6),
  (v) => v > 0,
);
expect("バッジが 6つに なる", await badgeCount(), 6);
await shot("24-six-badges");

// ── 15. かいりき・なみのり・そらをとぶ（v0.12-d）──
//
// **秘伝要員をパーティに入れない**（world.md §7）。
// 能力はプレイヤー自身が持つので、手持ちを1匹も入れ替えずにここを通せる。

await powerUp();

// かいりき ―― セキチクの おおきな いわ の先に道具がある
await goToMap("kanto-fuchsia-city", 3, 9, 80);
await talk("ArrowUp");
await drain(8);
expect(
  "かいりき が 無いうちは いわの むこうに 行けない",
  (await goToMap("kanto-fuchsia-city", 11, 5, 4)).x,
  (v) => v !== 11,
);
await goToMap("kanto-fuchsia-city", 9, 5, 30);
await useAbility("ArrowRight", "kanto-fuchsia-city:fuchsia-boulder");
await goToMap("kanto-fuchsia-city", 11, 5, 20);
await drain();
expect("いわの むこうに 行ける", (await spot()).x, 11);
await shot("25-strength");

// なみのり を おそわる（使うのは クチバの海。飛んでから)
await goToMap("kanto-fuchsia-city", 3, 6, 30);
await talk("ArrowUp");
await drain(8);

// そらをとぶ ―― 行き先は「来たことのある町」だけ。
// **歩いてカントーを横断しない。** 覚えた能力で移動するのが、この版の眼目でもある
await goToMap("kanto-celadon-city", 3, 11, 60);
await talk("ArrowUp");
await drain(8);
expect(
  "そらをとぶ の ボタンが 出る",
  (await page.isVisible("#open-fly")) ? "出た" : "出ない",
  "出た",
);
await page.click("#open-fly");
await page.waitForSelector("#field-panel [data-fly]");
const flyTargets = await page.$$eval("#field-panel [data-fly]", (b) => b.map((x) => x.dataset.fly));
note("そらをとぶ の 行き先", `${flyTargets.length}件 ${flyTargets.join(" ")}`);
expect(
  "行った町だけが 行き先に ならぶ",
  flyTargets.includes("kanto-vermilion-city") && !flyTargets.some((id) => id.startsWith("hub-"))
    ? "正しい"
    : "おかしい",
  "正しい",
);
await page.click('#field-panel [data-fly="kanto-vermilion-city"]');
await drain();
await page.waitForTimeout(700);
expect("そらをとぶ で クチバへ 飛べる", (await spot()).map, "kanto-vermilion-city");
await shot("26-fly");

// なみのり ―― 海へ出て、砂州の道具を拾う
canSurf = true;
await goToMap("kanto-vermilion-city", 9, 12, 40);
await drain();
const onWater = await spot();
expect(
  "なみのり で 海に 出られる",
  `${onWater.map} ${onWater.x},${onWater.y}`,
  "kanto-vermilion-city 9,12",
);
await shot("27-surf");

// ── 16. グレンじま と トキワジム（v0.12-e）──
//
// **ここで地図が輪になる。** 21番水道で グレン → マサラ と戻れるので、
// カントーはもう一直線ではない（木ではなくグラフ）。
await goToMap("kanto-fuchsia-city", 6, 11, 80);
expect("セキチクの 南に 出口が できた", (await spot()).map, "kanto-fuchsia-city");
await goToMap("kanto-cinnabar-island", 6, 1, 200);
expect("なみのり で グレンじまに つく", (await spot()).map, "kanto-cinnabar-island");
await shot("28-cinnabar");

expect(
  "カツラに 勝つと バッジが 7つに なる",
  await challengeGym("カツラ", "kanto-cinnabar-gym", 4, 2, 7),
  (v) => v > 0,
);

// **輪を歩いて確かめる。** グレン → 21番水道 → マサラ
await goToMap("kanto-pallet-town", 5, 11, 200);
expect("21ばんすいどう で マサラへ 戻れる（地図が輪になった）", (await spot()).map, "kanto-pallet-town");
await shot("29-loop");

// トキワジム（ジム8）。うけつけは バッジ7つで通す
await goToMap("kanto-viridian-city", 9, 12, 120);
await talk("ArrowUp");
await drain(6);
expect(
  "サカキに 勝つと バッジが 8つに なる",
  await challengeGym("サカキ", "kanto-viridian-gym", 4, 2, 8),
  (v) => v > 0,
);
expect("バッジが 8つに なる", await badgeCount(), 8);
await shot("30-eight-badges");

// ── 17. ポケモンリーグ（v0.12-f）──
//
// **かいりき の見せ場と、戻れない部屋。**
await goToMap("kanto-viridian-city", 1, 5, 120);
expect("トキワの 西に 出口が できた", (await spot()).map, "kanto-viridian-city");

// 22番道路のライバル。視線ではなく話しかけ（原作どおり道の真ん中に立っている）
await powerUp();
await goToMap("kanto-route-22", 3, 6, 60);
expect("22ばんどうろへ 行ける", (await spot()).map, "kanto-route-22");
await talk("ArrowUp");
await drain(8);
if (await page.isVisible("#battle")) {
  await fight();
  await page.waitForTimeout(800);
  await drain(30);
}
await shot("31-rival");

// 23番道路の検問。バッジ8つで開く
await goToMap("kanto-route-23", 5, 2, 60);
expect("23ばんどうろへ 行ける", (await spot()).map, "kanto-route-23");
// **ここでは「入れない」を試さない。** もう バッジが8つあるので、
// ぶつかった台本が話しかけた時点で けいびは通してしまう ―― 条件が満たされて
// いるのだから正しい。塞がる側は #86 とヤマブキ（§14）で見ている
await talk("ArrowUp");
await drain(8);
await goToMap("kanto-victory-road", 8, 11, 30);
expect("バッジ8つで チャンピオンロードに 入れる", (await spot()).map, "kanto-victory-road");

// かいりき の岩。どけないと北の出口へ行けない
expect(
  "かいりき の岩を どけるまで 抜けられない",
  (await goToMap("kanto-indigo-plateau", 4, 9, 4)).map,
  "kanto-victory-road",
);
// 岩は横道の途中（4,2）にある。立てるのは左どなりだけ
await goToMap("kanto-victory-road", 3, 2, 30);
await useAbility("ArrowRight", "kanto-victory-road:victory-boulder");
await goToMap("kanto-indigo-plateau", 4, 9, 60);
expect("かいりき で セキエイこうげんに つく", (await spot()).map, "kanto-indigo-plateau");
await shot("32-indigo");

// 四天王。**入ったら戻れない**
await goToMap("kanto-indigo-pokecenter", 4, 3, 30);
await talk("ArrowUp");
await drain();
await powerUp();
const FOUR = [
  ["カンナ", "kanto-league-lorelei"],
  ["シバ", "kanto-league-bruno"],
  ["キクコ", "kanto-league-agatha"],
  ["ワタル", "kanto-league-lance"],
  ["グリーン", "kanto-league-champion"],
];
for (const [name, map] of FOUR) {
  let won = false;
  for (let attempt = 1; attempt <= 3 && !won; attempt += 1) {
    if ((await spot()).map !== map) {
      // 負けたら復活地点からもう一度歩いて入る。**部屋に着けなくても諦めない**
      await goToMap(map, 4, 3, 80);
      if ((await spot()).map !== map) continue;
    }
    await talk("ArrowUp");
    await drain(8);
    if (await page.isVisible("#battle")) {
      await fight();
      await page.waitForTimeout(1000);
      await drain(30);
    }
    // 勝てば次の扉が開く（＝次の部屋へ歩ける）。負ければ復活地点に戻る
    const here = await spot();
    won = here.map === map || here.map === "kanto-indigo-plateau";
    if (!won) {
      note(name, `${attempt}回目は 負けた（いま ${here.map}）`);
      await powerUp();
    }
  }
  expect(`${name} に 勝てる`, won ? "勝った" : "勝てない", "勝った");
  if (!won) break;
  if (map !== "kanto-league-champion") {
    // **勝った直後は、まだ会話枠が開いていることがある。**
    // 開いたままだと以降のキーは全部そちらに吸われ、扉の前で足踏みする
    await drain(40);
    await clear();
    const next = FOUR[FOUR.findIndex((f) => f[1] === map) + 1][1];
    note(`${name} のあと`, await at());
    await goToMap(next, 4, 3, 40);
    expect(`${name} に 勝つと つぎの とびらが ひらく`, (await spot()).map, next);
  }
}
// **殿堂入りの画面が出る。** 閉じるまで先へ進まない
await page.waitForSelector("#field-panel", { state: "visible", timeout: 15000 }).catch(() => {});
const hall = (await page.textContent("#field-panel")) ?? "";
expect("でんどういり の画面が 出る", hall.includes("でんどういり") ? "出た" : "出ない", "出た");
await shot("33-hall-of-fame");
await page.click("#panel-close").catch(() => {});
await drain(20);
expect("とじると セキエイこうげんへ 戻る", (await spot()).map, "kanto-indigo-plateau");

// **記録はセーブに残る。** 画面を閉じたら消えた、では殿堂の意味が無い
const crowned = await readSave();
expect("でんどういりが セーブに 残る", crowned.global.hallOfFame.length, 1);
expect("スキーマが v5 に なる", crowned.schemaVersion, 5);
note(
  "きろくされた 手持ち",
  crowned.global.hallOfFame[0].party.map((p) => `${p.species} Lv${p.level}`).join(" ・ "),
);

// 拠点の「でんどうの ひ」で読み返せる。
// **チャンピオンロードは歩いて戻らない** ―― どけた岩は出入りで元に戻るので
// （world.md §7.1）、帰りにもう一度 かいりき が要る。そらをとぶ のほうが早い
cleared.clear();
await page.click("#open-fly");
await page.waitForSelector('#field-panel [data-fly="kanto-pallet-town"]');
await page.click('#field-panel [data-fly="kanto-pallet-town"]');
await drain();
await page.waitForTimeout(800);
expect("そらをとぶ で マサラへ 戻れる", (await spot()).map, "kanto-pallet-town");
// **`talk()` は使わない** ―― あれは最後に `drain()` するが、`drain()` は
// 選択肢のいちばん下（＝「やめる」）を押すので、ゲートの前で引き返してしまう
await backToHub();
await drain();
expect("拠点に 戻れる", (await spot()).map, "hub-plaza");
await goToMap("hub-plaza", 8, 7, 40);
await key("ArrowUp", 2, 220);
await key("z", 1, 400);
// **石碑は先に一言しゃべる。** 会話を送らないと `openHall` まで進まない
await drain(10);
await page.waitForSelector("#field-panel", { state: "visible", timeout: 8000 }).catch(() => {});
const monument = (await page.textContent("#field-panel")) ?? "";
expect(
  "拠点の でんどうの ひ で 読み返せる",
  monument.includes("カントー") ? "読めた" : "読めない",
  "読めた",
);
await shot("34-hall-monument");
await page.click("#panel-close").catch(() => {});
await drain();

console.log(`\nスクリーンショット: ${SHOTS}`);
console.log(errors.length === 0 ? "JS エラーなし" : `JS エラー ${errors.length} 件:\n${errors.join("\n")}`);
if (errors.length > 0) process.exitCode = 1;
await browser.close();
