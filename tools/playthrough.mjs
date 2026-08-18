/**
 * ブラウザで v0.7 の完了条件をひと続きに通す煙テスト。
 *
 *   npm run dev            （別のターミナルで）
 *   node tools/playthrough.mjs [URL]
 *
 * 単体テスト（packages/core/test/world.test.ts）は同じ道行きを core だけで通す。
 * こちらが見るのは **描画と入力が繋がっているか** ―― 型検査では絶対に落ちない層。
 * 実際、この台本を書いたことで次の2つが見つかった:
 *   - givePokemon の技指定が UI まで届いておらず、覚えていない技で戦っていた
 *   - 家具に囲まれて一生話しかけられない NPC（検証項目 #56 になった）
 */

import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
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

// ── 1. 家から町へ ──
note("開始", await at());
await clear();
await shot("1-house");
await key("ArrowDown", 2, 250);
await page.waitForTimeout(400);
expect("家を出た", await at(), (v) => v.startsWith("kanto-pallet-town"));
await shot("2-town");

// ── 2. 研究所へ。ドアは踏んで入る（v0.8 で interact から step に直した）──
await page.click('#speed button[data-s="logOnly"]');
await key("ArrowRight", 7);
await key("ArrowDown", 6);
await key("ArrowLeft", 6);
await key("ArrowUp", 2, 400);
expect("研究所に入った", await at(), (v) => v.startsWith("kanto-oak-lab"));

// ── 3. オーキドに話しかけて最初の1匹をもらう ──
// (4,6) → (4,5) → (1,5) → (1,3) → (3,3) で右を向いてオーキドに話しかける
await key("ArrowUp", 1);
await key("ArrowLeft", 3);
await key("ArrowUp", 2);
await key("ArrowRight", 2);
note("オーキドの前", await at());
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
// (3,3) → (1,3) → (1,6) → (7,6) → (7,4) で上を向いてライバルに話しかける
await key("ArrowLeft", 2);
await key("ArrowDown", 3);
await key("ArrowRight", 6);
await key("ArrowUp", 2);
note("ライバルの前", await at());
await key("z", 1, 400);
await clear();
await page.waitForSelector("#battle:not(.hidden)", { timeout: 5000 });
note("バトル開始", (await page.textContent("#log")).trim().split("\n")[0]);
await shot("5-rival");

/** 攻撃技を優先して押す（最初のボタンが変化技のことがある）。 */
async function pickMove() {
  const buttons = await page.$$("#controls .move");
  for (const b of buttons) {
    const meta = (await b.textContent()) ?? "";
    if (!meta.includes("— ・")) return b;
  }
  return buttons[0];
}

async function fight(limit = 80) {
  for (let i = 0; i < limit; i += 1) {
    if (await page.isHidden("#battle")) return "決着してマップに戻った";
    const move = await pickMove();
    const swap = await page.$("#controls .switch");
    if (move) await move.click();
    else if (swap) await swap.click();
    await page.waitForTimeout(200);
  }
  return "終わらなかった";
}
expect("ライバル戦", await fight(), "決着してマップに戻った");
await page.waitForTimeout(700);
await drain();
note("戦闘後のてもち", (await page.textContent("#field-party")).trim());

// ── 5. 1番道路へ出て、草むらで野生に会って逃げる ──
// **ライバル戦は3択のうち1つが不利**（ヒトカゲ 36%）。
// 負けると家に戻されるので、今どこに居るかを見てから町へ出る
const where = (await at()) ?? "";
if (where.startsWith("kanto-oak-lab")) {
  await key("ArrowDown", 2);
  await key("ArrowLeft", 3);
  await key("ArrowDown", 2, 400);
} else if (where.startsWith("kanto-players-house-1f")) {
  note("ライバル戦の結果", "負けて家に戻された（再挑戦できる）");
  await key("ArrowDown", 2, 250);
  await page.waitForTimeout(400);
}
expect("町に出た", await at(), (v) => v.startsWith("kanto-pallet-town"));
// 町の東端（x=10）まで寄ってから北上する。
// 途中に看板とNPCが立っているので、素朴に右→上では引っかかる
await key("ArrowRight", 10, 200);
await key("ArrowUp", 12, 200);
await key("ArrowLeft", 5, 200);
await key("ArrowUp", 2, 250);
expect("1番道路へ", await at(), (v) => v.startsWith("kanto-route-1"));
await shot("6-route");

// 段差を避けて東側から北上し、草むら (3〜5, 12〜13) に入る
await key("ArrowRight", 2, 200);
await key("ArrowUp", 3, 200);
await key("ArrowLeft", 2, 200);
note("草むら", await at());

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
// 1戦では無傷で終わることもある（コラッタが しっぽをふる だけで倒れる等）。
// **戦った跡が手持ちに残るか**を見たいので、変わるまで何戦かする
let battles = 0;
let hpAfter = hpBefore;
for (let i = 0; i < 40 && hpAfter === hpBefore; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 2, 200);
  if (await page.isVisible("#battle")) {
    battles += 1;
    await fight();
    await page.waitForTimeout(700);
    await drain();
    hpAfter = (await page.textContent("#field-party")).trim();
  }
}
note("野生と戦った回数", String(battles));
note("たたかった後のてもち", hpAfter);
expect(
  "戦った跡が手持ちに残る（HPか経験値）",
  hpAfter === hpBefore ? "残っていない" : "残った",
  "残った",
);
await shot("8-end");

console.log(`\nスクリーンショット: ${SHOTS}`);
console.log(errors.length === 0 ? "JS エラーなし" : `JS エラー ${errors.length} 件:\n${errors.join("\n")}`);
if (errors.length > 0) process.exitCode = 1;
await browser.close();
