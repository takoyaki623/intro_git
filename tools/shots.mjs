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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const URL = process.argv[2] ?? "http://localhost:5173/";
const OUT = "dist/shots";
const CHROME = process.env["CHROMIUM_PATH"] ?? "/opt/pw-browsers/chromium";

/** マップの経路探索（playthrough.mjs と同じ考え方）。 */
const MAPS = new Map(
  JSON.parse(readFileSync("packages/data/maps.json", "utf8")).map((m) => [m.id, m]),
);
const STEPS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

const blocked = (m, x, y) =>
  x < 0 || y < 0 || x >= m.size.width || y >= m.size.height ||
  m.collision[y * m.size.width + x] === true ||
  m.objects.some((o) => o.at.x === x && o.at.y === y && o.kind.type !== "item" && o.condition === undefined);

const warpAt = (m, x, y) =>
  m.warps.find((w) => w.at.x === x && w.at.y === y && w.trigger === "step") ?? null;

function neighbors(id, x, y) {
  const m = MAPS.get(id);
  const out = [];
  for (const [key, [dx, dy]] of Object.entries(STEPS)) {
    let nx = x + dx;
    let ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= m.size.width || ny >= m.size.height) continue;
    if (m.terrain[ny * m.size.width + nx] === "ledge") {
      if (key !== "ArrowDown") continue;
      nx += dx;
      ny += dy;
    }
    if (blocked(m, nx, ny)) continue;
    const w = warpAt(m, nx, ny);
    out.push(w === null ? { key, map: id, x: nx, y: ny } : { key, map: w.to.map, x: w.to.x, y: w.to.y });
  }
  return out;
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
  };
  // 道中のトレーナーは倒した状態にしておく。**撮りたいのは町であって連戦ではない**
  for (const flag of [
    "kanto.route2.bug-catcher-beaten", "kanto.forest.bug-1-beaten", "kanto.forest.bug-2-beaten",
    "kanto.pewter.gym-jr-beaten", "kanto.route3.lass-beaten", "kanto.route3.youngster-beaten",
    "kanto.moon.hiker-beaten", "kanto.moon.rocket-beaten", "kanto.route4.bug-beaten",
    "kanto.route5.hiker-beaten", "kanto.route6.camper-beaten",
  ]) {
    save.regions.kanto.flags[flag] = true;
  }
  save.regions.kanto.badges = 5;
  for (const flag of [
    "kanto.route11.gambler-beaten", "kanto.route8.lass-beaten",
    "kanto.route7.camper-beaten", "kanto.route16.biker-beaten",
  ]) {
    save.regions.kanto.flags[flag] = true;
  }
  save.regions.kanto.position = { map: "kanto-pallet-town", x: 5, y: 5, facing: "down" };
  save.regions.kanto.money = 3000;
  // **道中のトレーナーに勝てる手持ちにする。**
  // v0.12 で視線が入り、Lv5 のヒトカゲでは2番道路で全滅して
  // 撮影が家に戻されるようになった。撮りたいのはマップなので、勝敗は問わない
  for (const mon of Object.values(save.pokemon)) {
    mon.exp = 125000;
    mon.currentHp = 999;
    mon.moves = [
      { id: "brick-break", pp: 15 },
      { id: "bulldoze", pp: 20 },
      { id: "ember", pp: 25 },
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
  { file: "viridian-center", name: "ポケモンセンター", note: "屋内。カウンターと机", to: ["kanto-viridian-pokecenter", 4, 4] },
  { file: "route-2", name: "2番道路", note: "視線を持つトレーナー。届く範囲が薄く光る", to: ["kanto-route-2", 5, 12] },
  { file: "viridian-forest", name: "トキワの森", note: "木の迷路。視線が2本ある", to: ["kanto-viridian-forest", 5, 12] },
  { file: "pewter-city", name: "ニビシティ", note: "ジム（灰）・博物館・ポケセン・ショップ", to: ["kanto-pewter-city", 7, 11] },
  { file: "pewter-gym", name: "ニビジム", note: "岩とジムトレーナーの視線。奥にタケシ", to: ["kanto-pewter-gym", 4, 7] },
  { file: "mt-moon", name: "おつきみやま", note: "洞窟。曲がり角で視線が切れる", to: ["kanto-mt-moon", 4, 2] },
  { file: "cerulean-city", name: "ハナダシティ", note: "ジム2。町の東に川", to: ["kanto-cerulean-city", 7, 5] },
  { file: "cerulean-gym", name: "ハナダジム", note: "水路で通路が細い。奥にカスミ", to: ["kanto-cerulean-gym", 4, 7] },
  { file: "vermilion-city", name: "クチバシティ", note: "港町。南が海。ジム3", to: ["kanto-vermilion-city", 7, 7] },
  { file: "lavender-town", name: "シオンタウン", note: "ポケモンタワーのある町。ジムは無い", to: ["kanto-lavender-town", 7, 5] },
  { file: "celadon-city", name: "タマムシシティ", note: "ジム4（エリカ）。カントーで一番大きい町", to: ["kanto-celadon-city", 7, 7] },
  { file: "saffron-city", name: "ヤマブキシティ", note: "ジム6（ナツメ）。バッジ5つまで警備員が通さない", to: ["kanto-saffron-city", 8, 4] },
  { file: "fuchsia-city", name: "セキチクシティ", note: "ジム5（キョウ）。サファリゾーンはまだ閉まっている", to: ["kanto-fuchsia-city", 6, 5] },
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
  await page.click("#open-settings");
  await page.waitForSelector("#save-text");
  await page.fill("#save-text", JSON.stringify(SHOOTING_SAVE));
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

  /**
   * バトルになったら片付ける。
   *
   * 草むらを通るので**必ずエンカウントする**。逃げられるなら逃げ、
   * だめなら殴って終わらせる ―― 撮りたいのはマップなので、勝敗は問わない。
   */
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
        await page.waitForTimeout(150);
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
        const now = await spot();
        if (now.map !== from.map) break; // warp を踏んだ。引き直す
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
    if (want !== region) {
      if (want === "hub") await backToHub();
      else await enterKanto();
      region = want;
    }
    const ok = await goTo(map, x, y);
    await clearBattle();
    const file = `${place.file}-${size.label}.png`;
    await page.locator("#field-canvas").screenshot({ path: join(OUT, file) });
    const where = await at();
    console.log(
      ok
        ? `  ✓ ${place.name}（${size.label}）… ${where}`
        : `  △ ${place.name}（${size.label}）… ねらい ${map} ${x},${y} / いま ${where}`,
    );
    if (size.label === "phone") shots.push({ ...place, group: "マップ", file: place.file });
  }

  // ── 画面（マップ以外）──
  const shoot = async (file) => {
    // 画面まるごとは大きいので **CSS ピクセルで撮る**（等倍）。
    // マップは拡大して見たいので canvas だけ 2倍のまま ―― 用途が違う
    await page.screenshot({ path: join(OUT, `${file}-${size.label}.png`), scale: "css" });
  };

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
