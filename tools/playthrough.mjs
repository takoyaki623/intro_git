/**
 * ブラウザで v0.7〜v0.9 の完了条件をひと続きに通す煙テスト。
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

// ── 経路探索 ──
//
// **押した回数を数える台本は、この規模のマップでは必ず壊れる。**
// 草むらでエンカウントし、木や池で止まり、段差は南にしか降りられない。
// 実際、v0.9 で町を1つ足しただけで、手書きの手順は全部通らなくなった。
// マップデータそのものを読んで経路を出す。
const MAPS = new Map(
  JSON.parse(readFileSync("packages/data/maps.json", "utf8")).map((m) => [m.id, m]),
);
const STEPS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};

function blocked(map, x, y) {
  if (x < 0 || y < 0 || x >= map.size.width || y >= map.size.height) return true;
  const i = y * map.size.width + x;
  if (map.collision[i] === true) return true;
  // **条件つきのオブジェクトは通れる扱いにする。**
  // 消える前提のもの（進行を塞ぐオーキドなど）を壁として扱うと、
  // 本来の道が丸ごと消える ―― 実際、これで1番道路へ一生行けなかった。
  // 条件が残っていれば実際に進めず、goToMap が経路を引き直す。
  return map.objects.some(
    (o) => o.at.x === x && o.at.y === y && o.kind.type !== "item" && o.condition === undefined,
  );
}

const terrainAt = (map, x, y) => map.terrain[y * map.size.width + x];

const warpAt = (map, x, y) =>
  map.warps.find((w) => w.at.x === x && w.at.y === y && w.trigger === "step") ?? null;

/**
 * 1歩で行ける先。マップをまたぐ。
 *
 *   - 段差は南向きの飛び降りとしてだけ繋がる（原作どおりの一方通行）
 *   - 踏む warp のマスに入ると、その場で接続先へ移る。**同じ1歩の中で起きる**
 */
function neighbors(mapId, x, y) {
  const map = MAPS.get(mapId);
  const out = [];
  for (const [key, [dx, dy]] of Object.entries(STEPS)) {
    let nx = x + dx;
    let ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= map.size.width || ny >= map.size.height) continue;

    if (terrainAt(map, nx, ny) === "ledge") {
      if (key !== "ArrowDown") continue;
      nx += dx;
      ny += dy;
    }
    if (blocked(map, nx, ny)) continue;

    const warp = warpAt(map, nx, ny);
    out.push(
      warp === null
        ? { key, map: mapId, x: nx, y: ny }
        : { key, map: warp.to.map, x: warp.to.x, y: warp.to.y },
    );
  }
  return out;
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
async function goToMap(map, x, y, tries = 8) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const from = await spot();
    if (from.map === map && from.x === x && from.y === y) return from;

    const path = route(from, { map, x, y });
    if (path === null) {
      note("経路なし", `${from.raw} → ${map} ${x},${y}`);
      return from;
    }
    let drifted = false;
    for (const step of path) {
      await key(step.key, 1, 175);
      if (await page.isVisible("#battle")) {
        await fight();
        await page.waitForTimeout(800);
        await drain();
        drifted = true;
        break;
      }
      const now = await spot();
      // 全滅で飛ばされた・向き直りで進まなかった等。引き直す
      if (now.map !== step.node.map || now.x !== step.node.x || now.y !== step.node.y) {
        drifted = true;
        break;
      }
    }
    if (!drifted) return spot();
  }
  return spot();
}

/** 同じマップの中で歩く。 */
const goTo = async (x, y) => goToMap((await spot()).map, x, y);


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

// ── 6.5 トキワシティ。ショップで買い、道具を使う（v0.9-b の眼目）──

/** その場で向きだけ変えて話しかける。 */
async function talk(direction) {
  await key(direction, 2, 200);
  await key("z", 1, 400);
  await drain();
}

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
await page.click('#modes button[data-m="save"]');
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
await page.click('#modes button[data-m="field"]');
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
await page.click('#modes button[data-m="save"]');
await page.waitForSelector("#save-text");
await page.fill("#save-text", exported);
await page.click("#save-import");
await page.waitForTimeout(900);
await page.click('#modes button[data-m="field"]');
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(400);
note("読み戻す前に歩いた先", moved);
expect("読み戻すと元の場所に戻る", await at(), beforeReload.at);
await shot("11-imported");

// ── 9. BP交換所と持ち物（v0.9-c の眼目）──
//
// BP は施設を遊んで貯めるものなので、台本では**セーブを書き換えて**用意する。
// エクスポート／インポートが本当に往復していることの確認にもなっている。
await page.click('#modes button[data-m="save"]');
await page.waitForSelector("#save-export");
await page.click("#save-export");
const cheat = JSON.parse(await page.inputValue("#save-text"));
cheat.global.bp = 100;
await page.fill("#save-text", JSON.stringify(cheat));
await page.click("#save-import");
await page.waitForTimeout(900);

await page.click('#modes button[data-m="facility"]');
await page.waitForSelector("#bp-shop");
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

// 持ち物を持たせる（v0.5 から動いていた機構が、本編で初めて届く）
await page.click('#modes button[data-m="field"]');
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(300);
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
await page.click('#modes button[data-m="save"]');
await page.waitForSelector("#save-export");
await page.click("#save-export");
const weak = JSON.parse(await page.inputValue("#save-text"));
for (const mon of Object.values(weak.pokemon)) mon.currentHp = 1;
const respawn = weak.regions.kanto.respawn;
note("セーブに入っている 復活地点", `${respawn.map} ${respawn.x},${respawn.y}`);
expect("復活地点は ポケモンセンター", respawn.map, "kanto-viridian-pokecenter");
await page.fill("#save-text", JSON.stringify(weak));
await page.click("#save-import");
await page.waitForTimeout(900);

await page.click('#modes button[data-m="field"]');
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(300);
// 1番道路の草むらへ戻り、負けるまで戦う
await goToMap("kanto-route-1", 4, 3);
let lost = false;
for (let i = 0; i < 30 && !lost; i += 1) {
  await key(i % 2 === 0 ? "ArrowLeft" : "ArrowRight", 1, 190);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(800);
    await drain();
    lost = (await spot()).map === respawn.map;
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

console.log(`\nスクリーンショット: ${SHOTS}`);
console.log(errors.length === 0 ? "JS エラーなし" : `JS エラー ${errors.length} 件:\n${errors.join("\n")}`);
if (errors.length > 0) process.exitCode = 1;
await browser.close();
