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
import { emptyWorldState, neighborsOf, walkableTerrains } from "@pkmn/core";
import { allFieldAbilities } from "@pkmn/data";
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

const startedAt = Date.now();
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

/**
 * ゲームが次の入力を受け付けるまで待つ（v1.1-i）。
 *
 * **待ち時間を数えるのをやめて、受け付けているかを読む。**
 * 1歩ぶんの待ち（`stepWait`）は「歩けたときのアニメ」に合わせてあったが、
 * ゲームは**ぶつかったときに `BUMP_MS`(110ms) 止まる** ―― じてんしゃの1歩(95ms)より長い。
 * その15msの差で z が飲み込まれ、ぶつかった相手に永久に話しかけられず、
 * 5番・6番道路のちかつうろ出口で台本が60回引き直して諦めていた。
 * 「歩く」と「ぶつかる」で長さが違うものを、片方の数字で待っていたのが間違い。
 */
async function ready(limit = 12) {
  for (let i = 0; i < limit; i += 1) {
    const busy = await page.getAttribute("#field-canvas", "data-busy").catch(() => null);
    if (busy !== "1") return;
    await page.waitForTimeout(40);
  }
}

async function key(k, n = 1, wait = 200) {
  for (let i = 0; i < n; i += 1) {
    await page.keyboard.press(k);
    await page.waitForTimeout(wait);
    await ready();
  }
}

/**
 * 1歩ぶんの待ち時間（v1.1-d）。
 *
 * **原作の尺度に広げるとタイル数が2〜3倍になる**ので、先に台本を速くしておく。
 * 速くできる根拠は じてんしゃ（v1.1-b）で、歩行アニメが 130ms → 62ms になる ――
 * アニメより短く待つと、次のキーが歩行中に飛んで捨てられる。
 *
 * **1入力＝1マスは変えない。** 速さは待ち時間だけの話にしてある
 * （2マス進む実装にすると台本と撮影が同時に、しかも黙ってずれる・world.md §9.9）。
 */
let stepWait = 175;
const RIDING_MS = 95;
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
/**
 * 台本が押した岩の現在地（v1.1-f）。`objectKey()` → 座標。
 *
 * **`cleared` と同じ理由で台本にも要る。** どけた岩を経路探索が知らないと
 * 「入れるのに行けない」と報告するのと同じで、押した岩を知らないと
 * **押して空いたマスを壁だと思い込む** ―― 岩の向こうへ行く手順が引けない。
 */
const pushedAt = {};
let canSurf = false;
const able = () => {
  const abilities = canSurf ? ["surf"] : [];
  return {
    ...emptyWorldState(),
    abilities,
    // 通れる地形は能力から導く（v1.1-c）。片方だけ持つと
    // 「なみのり は使えるのに水に入れない」経路探索になる
    walkable: walkableTerrains(allFieldAbilities, abilities),
    cleared: [...cleared],
    moved: { ...pushedAt },
  };
};

/**
 * 1歩で行ける先。マップをまたぐ。**規則は core が持っている**（v1.1-a）。
 *
 * 条件つきオブジェクトだけは通れる扱いにする ―― 消える前提のもの
 * （進行を塞ぐオーキドなど）を壁として扱うと本来の道が丸ごと消える。
 * 実際、これで1番道路へ一生行けなかった。条件が残っていれば実際に進めず、
 * `goToMap` が経路を引き直す。
 */
/**
 * いま立っているフラグ（v1.1-g-3）。`draw()` が canvas に出している。
 *
 * **推測をやめるために要る。** 条件つきオブジェクトを一律「素通りできる」と
 * 見なすと、当分どかない門番（ハナダのどうくつの けいび）を通れると思い込み、
 * 同じ壁に何十回もぶつかる。逆に一律「壁」と見なすと、
 * **話しかければ消えるもの**（トレーナー・かいりき の岩）の向こうへ行けなくなる。
 * 見るべきは種類ではなく**条件が今どうか**。
 */
let liveFlags = new Set();
async function refreshFlags() {
  const raw = (await page.getAttribute("#field-canvas", "data-flags").catch(() => null)) ?? "";
  liveFlags = new Set(raw === "" ? [] : raw.split(","));
}
/** 条件が今 成り立っているか。**フラグ以外は判断しない**（消える前提の側に倒す）。 */
function holds(cond) {
  if (cond === undefined) return true;
  if (cond.kind === "flag") return liveFlags.has(cond.flag) === cond.value;
  if (cond.kind === "and") return cond.of.every(holds);
  if (cond.kind === "or") return cond.of.some(holds);
  return false;
}
/**
 * そのマスに**今**立っていて、話しかけても どかない相手が居るか。
 *
 * トレーナーと障害物は除く ―― あれは**ぶつかれば消せる**ので、
 * 経路探索は通れる前提でよい（`goToMap` が話しかけて片付ける）。
 */
function standing(mapId, x, y) {
  const map = MAPS.get(mapId);
  if (map === undefined) return false;
  return map.objects.some(
    (o) =>
      o.at.x === x &&
      o.at.y === y &&
      o.condition !== undefined &&
      (o.kind.type === "npc" || o.kind.type === "sign") &&
      holds(o.condition),
  );
}

function neighbors(mapId, x, y) {
  return neighborsOf(MAPS.get(mapId), able(), x, y, { ignoreConditional: true }, MAPS)
    .filter((n) => !standing(n.map, n.x, n.y))
    .map((n) => ({
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
    await refreshFlags();
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
      await key(step.key, 1, stepWait);
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
        // **話しかければ消えるもの**（トレーナー・かいりき の岩）は
        // 経路探索では素通りできる扱いなので、実際にぶつかったら話しかける
        // ―― 人がやることと同じ。v0.12-b でおつきみやまのやまおとこに
        // 永久にぶつかり続けて気づいた。
        // **どかない門番は経路探索がもう避けている**（`standing`）ので、
        // ここに来るのは「ぶつかれば消せる」もののはず
        if (now.map === before.map && now.x === before.x && now.y === before.y) {
          // **ぶつかった直後は、まだ入力を受け付けていない**（`BUMP_MS`）
          await ready();
          await page.keyboard.press("z");
          // 300ms では文字が出そろっていない。出そろうのを待ってから読む
          await page.waitForTimeout(450);
          // **「つかいますか?」のときだけ はい を押す。**
          //
          // ふさいでいるのが き なら「いあいぎり を つかいますか?」が出る。
          // `drain` は z を押すだけで選べないので、木は永久に切られない ――
          // クチバジムの前の き は出入りのたびに生え直る（`cleared` は保存しない）ので、
          // ポケモンセンターに寄って戻った瞬間、ジムに入れなくなっていた。
          //
          // **だが無条件に `accept` してはいけない。** あれは先頭の選択肢を押すので、
          // グレンジムのクイズ扉に**勝手に正解**してしまう ――
          // 「まちがえたら開かない」を確かめている最中に、道具が答え直していた。
          // 開けるのは目的だが、**開け方まで道具が決めてはいけない。**
          const asked = ((await page.textContent("#field-text")) ?? "").replace(/\s+/g, "");
          if (asked.includes("つかいますか")) await accept();
          else await drain();
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
  // **諦めたことを言う。** 「経路なし」は言うのに、試行を使い切ったときは
  // 黙って今いる場所を返していた ―― マチスに挑めなかった回、
  // ログには何の手がかりも残らず、原因を突き止めるのに1周（16分）かかった。
  // 道具が黙って諦めるのは、落ちるより悪い
  const gaveUp = await spot();
  note("たどりつけなかった", `${gaveUp.raw} → ${map} ${x},${y}（${tries}回ためした）`);
  return gaveUp;
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

/**
 * 岩をスイッチまで押す（v1.1-f）。
 *
 * **押すのは「歩く」と同じ入力**なので、専用の操作は無い ――
 * 岩の反対側に立って、同じ向きへ歩き続けるだけ。
 * 台本がやることは2つだけ:
 *   1. 立つ位置を計算する（岩の1マス手前。ここは `goToMap` に任せる）
 *   2. 押した結果を `moved` に書いて、**経路探索に世界の変化を教える**
 *
 * 2 を忘れると、押した直後から「経路なし」で止まる。
 * `cleared` で一度踏んだ穴（v0.12-d）と同じ形。
 */
async function pushBoulder(mapId, objectId, direction, times) {
  const map = MAPS.get(mapId);
  const object = map.objects.find((o) => o.id === objectId);
  const step = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[direction];
  let at = pushedAt[`${mapId}:${objectId}`] ?? { ...object.at };

  // 岩の反対側へ回り込む。**押す向きの逆隣にしか立てない**
  await goToMap(mapId, at.x - step[0], at.y - step[1], 30);
  for (let i = 0; i < times; i += 1) {
    await key(direction, 1, 260);
    at = { x: at.x + step[0], y: at.y + step[1] };
    pushedAt[`${mapId}:${objectId}`] = at;
  }
  const now = await spot();
  expect(
    `岩を ${times}マス 押すと プレイヤーも ${times}マス 進む`,
    `${now.x},${now.y}`,
    `${at.x - step[0]},${at.y - step[1]}`,
  );
  return at;
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
/**
 * そらをとぶ で町へ飛ぶ。
 *
 * **飛べたかどうかを見る。** `#open-fly` は屋内でも見えている
 * （隠すかどうかは能力だけで決まる）ので、「ボタンがある＝飛べる」ではない ――
 * ミュウツーに負けてポケモンセンターに飛ばされた回、押しただけで
 * 飛べたつもりになり、そこから拠点まで歩く経路を引いて詰んだ。
 * 飛べなければ**建物の外へ出て**からもう一度。
 */
/**
 * 遠くへは**目印を経由して**歩く（v1.1-k）。
 *
 * 世界が 130 → 195枚に広がって、「今いる場所から目的地まで」を1回の `goToMap` に
 * 任せる書き方が当たらなくなった ―― 途中の野生・視線・引き直しで予算を使い切る。
 * 町を1つずつ踏んでいけば、**1区間が短くなるぶん確実**になる。
 */
async function travel(waypoints, tries = 100) {
  for (const [map, x, y] of waypoints) {
    const here = await goToMap(map, x, y, tries);
    if (here.map !== map) note("目印に つけなかった", `${here.raw} → ${map}`);
  }
}

async function flyTo(town) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await spot()).map === town) return;
    // **会話が開いていると そらをとぶ のボタンは押せない**（v1.1-k）。
    // 開いたままだと下の分岐が「建物の中に居る」と誤解して、
    // **今のマップの最初の warp へ歩き出す** ―― 行き先はどこでもない場所になる。
    // 実際これで、ニビへ飛ぶはずが おつきみやま の中で立ち往生した
    await drain(8);
    if (await page.isVisible("#open-fly")) {
      await page.click("#open-fly");
      const entry = await page
        .waitForSelector(`#field-panel [data-fly="${town}"]`, { timeout: 4000 })
        .catch(() => null);
      if (entry !== null) {
        await entry.click().catch(() => {});
        await drain();
        await page.waitForTimeout(900);
        if ((await spot()).map === town) return;
      } else {
        note("そらをとぶ の行き先に無い", town);
        await page.click("#panel-close").catch(() => {});
      }
    }
    // **飛べないなら、歩き出さずに帰る**（v1.1-k）。
    // ここは以前「ボタンが見えない＝建物の中だ」とみなして
    // *今のマップの最初の warp* へ歩いていた。**そらをとぶ をまだ覚えていない区間**でも
    // 同じ道を通るので、ニビへ飛ぶつもりが おつきみやま の中へ walk していた ――
    // 道具が黙って歩き出すのは、黙って諦めるより悪い。
    await refreshFlags();
    if (!liveFlags.has("kanto.ability.fly")) {
      note("そらをとぶ が まだ 使えない", town);
      return;
    }
    // 覚えているのにボタンが無いなら、建物の中に居る。出口へ出てからもう一度
    const here = MAPS.get((await spot()).map);
    const door = here?.warps?.[0]?.to;
    if (door === undefined) return;
    await goToMap(door.map, door.x, door.y, 20);
  }
}

async function backToHub() {
  // **どこから呼ばれても帰れるようにする。**
  // ミュウツーに負けてポケモンセンターに飛ばされた回、セキエイからマサラまで
  // 歩く経路を引こうとして「経路なし」で止まった ―― チャンピオンロードの岩は
  // 出入りで初期位置に戻るので、歩いて帰る道は最初から無い。
  // 人と同じで、まず外へ出て そらをとぶ
  if ((await spot()).map !== "kanto-pallet-town") await flyTo("kanto-pallet-town");
  await goToMap("kanto-pallet-town", 9, 10, 60);
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
// **草むらの上に居ることを、毎回たしかめ直す。**
// 2マスを往復するだけの見張りだと、逃げたあとの立ち位置しだいで
// 草を1マスも踏まずに40回ぶん空振りする ―― 実際0戦で1回落ちた。
// 1番道路の草は 3〜5列・12〜13行なので、その帯を端から端まで歩く
await goToMap("kanto-route-1", 4, 12, 20);
for (let i = 0; i < 40 && hpAfter === hpBefore && expAfter === expBefore && battles < 4; i += 1) {
  if (i % 8 === 0) await goToMap("kanto-route-1", 4, 12, 10);
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
note("野生と戦った回数", `${battles}（さいごに 居た場所 ${(await spot()).raw}）`);
note("たたかった後のてもち", `${hpAfter} / けいけんち ${expBefore} → ${expAfter}`);
expect(
  "戦った跡が手持ちに残る（HPか経験値）",
  hpAfter !== hpBefore || expAfter > expBefore ? "残った" : "残っていない",
  "残った",
);
await shot("8-end");

// ── 6.5 トキワシティ。ショップで買い、道具を使う（v0.9-b の眼目）──

/** その場で向きだけ変えて話しかける。 */
/**
 * そのオブジェクトに話しかける（v1.1-g-3）。
 *
 * **立つマスと向きを、地図から出す。**
 * 決め打ちすると、台や壁や「その相手自身」の上に立とうとして
 * 「経路なし」で止まる ―― この版だけで3回踏んだ:
 *   かせきの真上（岩）・景品の店員の真下（スロット台）・ポスターの真下（階段）。
 * どれも「隣に立って向く」という同じ動作なのに、座標だけが毎回ちがう。
 */
async function talkToObject(mapId, objectId) {
  const map = MAPS.get(mapId);
  const target = map?.objects?.find((o) => o.id === objectId);
  if (target === undefined) {
    note("居ない相手", `${mapId}/${objectId}`);
    return false;
  }
  const blocked = new Set(
    map.objects
      .filter((o) => o.kind.type !== "item" && o.kind.type !== "switch")
      .map((o) => `${o.at.x},${o.at.y}`),
  );
  const open = (x, y) =>
    x >= 0 &&
    y >= 0 &&
    x < map.size.width &&
    y < map.size.height &&
    map.collision[y * map.size.width + x] !== true &&
    !blocked.has(`${x},${y}`);
  const spots = [
    { x: target.at.x, y: target.at.y + 1, dir: "ArrowUp" },
    { x: target.at.x, y: target.at.y - 1, dir: "ArrowDown" },
    { x: target.at.x - 1, y: target.at.y, dir: "ArrowRight" },
    { x: target.at.x + 1, y: target.at.y, dir: "ArrowLeft" },
  ].filter((s) => open(s.x, s.y));
  for (const spot0 of spots) {
    const here = await goToMap(mapId, spot0.x, spot0.y, 40);
    if (here.map !== mapId || here.x !== spot0.x || here.y !== spot0.y) continue;
    await talk(spot0.dir);
    return true;
  }
  note("話しかけられなかった", `${mapId}/${objectId}（立てる隣 ${spots.length}マス）`);
  return false;
}

async function talk(direction) {
  await key(direction, 2, 200);
  await key("z", 1, 400);
  await drain();
}

/**
 * 選択肢を**文字で選ぶ**（v1.1-g）。
 *
 * `drain()` は最後のボタンを押す ―― 会話を閉じるための「やめる」が
 * だいたい最後にあるからで、それでよかった。
 * だがクイズ扉では**どちらを選んだかが結果を変える**ので、
 * 「最後を押す」では正解にも不正解にもならない。
 */
async function choose(text) {
  // 選択肢の前に本文がある。**読み終わるまで進めてから**選ぶ
  for (let i = 0; i < 12; i += 1) {
    if (await page.isVisible("#field-text .choices")) break;
    await page.keyboard.press("z");
    await page.waitForTimeout(230);
  }
  const buttons = await page.$$("#field-text .choices button");
  const labels = [];
  for (const button of buttons) labels.push(((await button.textContent()) ?? "").trim());
  // まず完全一致。**次に「含んでいる」ものが1つだけなら、それ。**
  // 景品の選択肢は「ケーシィ（1800円）」のように値段まで書いてあり、
  // 完全一致だけだと**値段を変えた日に台本が黙って選べなくなる** ――
  // 選びたいのは ケーシィ であって、値段はその日の設定でしかない
  let index = labels.indexOf(text);
  if (index < 0) {
    const hits = labels.map((l, i) => (l.includes(text) ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 1) index = hits[0];
  }
  if (index < 0) {
    note("選べなかった", `${text}（出ていたのは ${labels.join(" / ") || "なし"}）`);
    return false;
  }
  await buttons[index].click();
  await page.waitForTimeout(260);
  return true;
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
// **ここから じてんしゃ に乗る**（v1.1-d）。歩行アニメが半分以下になるので、
// 1歩ぶんの待ち時間も詰められる ―― 広げたマップを歩き切るための前提
cheat.global.bag = { ...cheat.global.bag, bicycle: 1 };
await page.fill("#save-text", JSON.stringify(cheat));
await page.click("#save-import");
await page.waitForTimeout(900);
await page.click("#settings-back");
await page.waitForSelector("#field-canvas");
await page.waitForTimeout(400);
stepWait = RIDING_MS;
note("じてんしゃ", `ここから 1歩 ${stepWait}ms（それまでは 175ms）`);

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
//
// **弱くするのは草むらに着いてから**（v1.1-b で順番を入れ替えた）。
// v1.1-a で `goToMap` が「割り込んだバトルを片付ける」ようになったので、
// 先に HP を1にすると**道中で全滅し、そこで回復してしまう** ――
// 草むらに着いた時点では満タンに戻っていて、確かめたい状態が消えていた。
// 台本を強くした変更が、別の台本の前提を壊した形。
await goToMap("kanto-route-1", 4, 3);
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
// もう草むらに立っている。あとは負けるまで歩く
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
// **相手がまだそこに居るかを先に見る。** 居ないなら視線は働かなくて当然で、
// 「視線が壊れた」と「もう倒していた」を、画面からは見分けられない
{
  const f = (await readSave()).regions.kanto.flags;
  note("視線の相手", f["kanto.route2.bug-catcher-beaten"] === true ? "もう 倒している" : "まだ 居る");
}
// **向きを合わせてから踏み込む。** 1回押しただけでは、向きが違えば
// 「向き直り」で終わって1歩も入らない ―― goToMap の経路が変わった日に
// 「視線に入っても何も起きない」と誤報した（v1.1-g-3）
if ((await spot()).facing !== "up") await key("ArrowUp", 1, 250);
await key("ArrowUp", 1, 250);
// **固定の待ち時間で判定しない。** 相手はこちらへ歩いてくるので、
// かかる時間は距離とアニメの速さで変わる ―― 1400ms 決め打ちで
// 「なにも起きない」と誤報した。出るまで待って、出なければ出ない。
// 踏み込んだ先の座標も残す（押しが捨てられたのか、視線が働かないのかを分ける）
let engaged = false;
for (let i = 0; i < 20 && !engaged; i += 1) {
  engaged = await talking();
  if (!engaged) await page.waitForTimeout(250);
}
note("踏み込んだ あと", await at());
// **話しかけていないのに向こうから始まる**のが視線。まず会話が開く
expect("視線に 入ると むこうから しかけてくる", engaged ? "しかけてきた" : "なにも起きない", "しかけてきた");
await drain();
await page.waitForTimeout(400);
expect("そのまま しょうぶに なる", (await page.isVisible("#battle")) ? "なった" : "ならない", "なった");
// **`fight()` は `#battle` が無ければ即「決着した」と答える。**
// 戦っていないのに緑になるので、戦いに入ったことを先に確かめる
expect("視線バトルの 決着", (await page.isVisible("#battle")) ? await fight() : "戦いに 入っていない", "決着してマップに戻った");
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

// ── ニビの博物館 ―― 扉だけ繋がっていなかった建物（検証 #115・v1.1-g-3）──
//
// **確かめる場所の隣に居るうちに確かめる**（v1.1-k で移動）。
// 元はカントーを一周したあとに置いていて、カビゴンを起こした場所から
// おつきみやま を越えて歩かせていた ―― 世界が195枚に広がってからは、
// その区間だけで予算（100回の引き直し）を使い切って届かなくなった。
// **台本が測りたいのは「扉が繋がっているか」であって「そこまで歩けるか」ではない。**
await goToMap("kanto-pewter-museum", 4, 2, 60);
expect("ニビの 博物館に 入れる（扉が 繋がった）", (await spot()).map, "kanto-pewter-museum");
await talk("ArrowUp");
await drain(10);
const bagAmber = (await readSave()).global.bag;
expect("ひみつのコハク を もらう", `${bagAmber["old-amber"] ?? 0}`, "1");
await shot("18-museum");

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
// ── ハナダのどうくつ（v1.1-g-2）──
//
// **殿堂入りするまで入口にけいびが立っている。** 条件つきオブジェクトなので、
// 経路探索は通れる扱いで道を引く ―― だから「行けない」ことは
// *歩いてみないと分からない*（カビゴンで踏んだのと同じ形）。
//
// **測るのはハナダに居るあいだ。** これを終盤に置いたら、23番道路から
// ハナダまで歩いて戻ることになり、次の区間の歩数の予算が足りなくなった。
expect(
  "殿堂入りするまで ハナダのどうくつには 入れない",
  (await goToMap("kanto-cerulean-cave", 6, 7, 12)).map,
  (v) => v !== "kanto-cerulean-cave",
);

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

// **ジムの前にポケモンセンターへ寄る** ―― 人がやることと同じ。
// v1.1-d でヤマブキ経由になり、クチバまでの道が2倍近くなった。
// 着くころには削れていて、マチスに負けるようになった
// （「決着してマップに戻った」は勝敗を含まない ―― バッジの数で気づいた）
await goToMap("kanto-vermilion-pokecenter", 4, 3, 60);
await talk("ArrowUp");
await drain();
note("マチスの前に 回復", (await page.textContent("#field-party")).trim());

// **`challengeGym` は使わない。** あれは先頭で powerUp（Lv100）するので、
// 序盤の実戦がまるごと消える ―― ここは「育てた手持ちで勝てるか」を見る場所。
// 回復して挑み直すだけにする
let surge = 0;
for (let attempt = 1; attempt <= 3 && surge === 0; attempt += 1) {
  // **き は出入りのたびに生え直る**（`cleared` は保存しない派生値・原作と同じ）。
  // ポケモンセンターに寄って戻ったら、もう一度切らないとジムに入れない ――
  // 経路探索は き を壁として扱うので、切らないまま呼ぶと「経路なし」で止まる。
  // 人がやることと同じで、行くたびに切る
  await goToMap("kanto-vermilion-city", 6, 10, 60);
  if ((await spot()).map === "kanto-vermilion-city") {
    await useAbility("ArrowLeft", "kanto-vermilion-city:vermilion-tree");
  }
  await goToMap("kanto-vermilion-gym", 4, 2, 80);
  if (attempt === 1) {
    // **挑めなかったとき、届いていないのか話しかけ損ねたのかを分ける。**
    // 前は「いどめない」しか出ず、どちらか分からなかった
    expect("マチスの まえに 立てる", (await spot()).raw, "kanto-vermilion-gym 4,2 up");
  }
  await talk("ArrowUp");
  await drain(8);
  if (attempt === 1) {
    expect("マチスに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
  }
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(800);
    await drain(30);
  }
  if ((await badgeCount()) >= 3) {
    surge = attempt;
    break;
  }
  note(
    "マチス",
    `${attempt}回目は だめだった（バッジ ${await badgeCount()} / いま ${(await spot()).raw} / ${((await page.textContent("#field-party")) ?? "").trim()}）`,
  );
  await goToMap("kanto-vermilion-pokecenter", 4, 3, 60);
  await talk("ArrowUp");
  await drain();
}
expect("マチスに 勝つと バッジが 3つに なる", surge, (v) => v > 0);

await page.click("#open-settings");
await page.waitForSelector("#save-export");
await page.click("#save-export");
const threeBadges = JSON.parse(await page.inputValue("#save-text"));
expect("バッジが セーブにも 3つ 入る", threeBadges.regions.kanto.badges, 3);
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

/** 所持金を決め打ちにする（v1.1-h）。財布の中身に検査を左右させないため。 */
async function setMoney(amount) {
  await page.click("#open-settings");
  await page.waitForSelector("#save-export");
  await page.click("#save-export");
  const save = JSON.parse(await page.inputValue("#save-text"));
  save.regions.kanto.money = amount;
  await page.fill("#save-text", JSON.stringify(save));
  await page.click("#save-import");
  await page.waitForTimeout(900);
  await page.click("#settings-back");
  await page.waitForSelector("#field-canvas");
  await page.waitForTimeout(400);
  await drain();
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

// ── ヤマブキは4叉路（v1.1-d）──
//
// **北門から入り、南門から出る。** v1.0 まで出入口は西と東の2つだけで、
// 5番と6番道路が町を迂回して直結していた ―― 原作では迂回するのは ちかつうろ。
await goToMap("kanto-route-5", 5, 2, 80);
expect("5番道路に 出られる", (await spot()).map, "kanto-route-5");
await goToMap("kanto-saffron-city", 11, 3, 60);
expect("5番道路から 北門で ヤマブキに 入れる", (await spot()).map, "kanto-saffron-city");
await goToMap("kanto-route-6", 5, 2, 60);
expect("南門から 6番道路に 抜けられる", (await spot()).map, "kanto-route-6");

// **ちかつうろ は近道であって本道ではない。** 通れることだけ確かめる
await goToMap("kanto-underground-path", 2, 5, 40);
expect("ちかつうろ に 入れる", (await spot()).map, "kanto-underground-path");
await goToMap("kanto-route-5", 9, 6, 40);
expect("ちかつうろ で 5番道路へ 戻れる", (await spot()).map, "kanto-route-5");

await goToMap("kanto-saffron-city", 5, 5, 80);
expect("ヤマブキまで 行ける", (await spot()).map, "kanto-saffron-city");
await talk("ArrowUp");
await drain(6);
await goToMap("kanto-saffron-city", 5, 5, 20);
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
async function challengeGym(label, map, x, y, want, dir = "ArrowUp") {
  // **5回まで。** 台本の戦い方は「上から順に技を押す」だけなので、
  // えんまく で命中を下げてくる相手には素で負ける（キョウで3連敗した）
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await powerUp();
    await goToMap(map, x, y, 80);
    if ((await spot()).map !== map) {
      note(`${label}`, `ジムに 入れない（いま ${await at()}）`);
      return 0;
    }
    await talk(dir);
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

  // ── タマムシデパート（v1.1-i）──
  //
  // 品揃えを**階で**分けた。1階 案内・2階 どうぐ・3階 わざマシン・4階 しんかの どうぐ。
  // 階段は1本道なので、**4階へ一気に行かず1階ずつ確かめる** ――
  // 「確かめる場所の隣に居るうちに確かめる」（v1.1-j で台本が3回落ちて学んだ）。
  //
  // v1.1-b からの石の店員は、この版で**4階へ移った**。
  // ここが `kanto-celadon-mart`（5,2）の右を向くだけだった頃の跡が
  // 「石の店員は右」というコメントで、**その相手はもう1階に居ない。**

  /** その階の店を開き、品目を読んで、買わずに閉じる。 */
  const dept = async (map, at, dir, label) => {
    const here = await goToMap(map, at.x, at.y, 60);
    expect(`${label}に 入れた`, here.map, map);
    if (here.map !== map) return [];
    await key(dir, 2, 200);
    await key("z", 1, 400);
    await clear();
    const items = await page.$$eval("#field-text .choices button", (b) =>
      b.map((x) => x.textContent),
    );
    note(label, items.slice(0, 4).join(" / ") || "（品が出ていない）");
    // **買わずに閉じる。** 品が出ていなければ会話を流すだけにする
    // （nth-child(0) は必ず見つからず、30秒待って落ちる）
    await drain();
    return items;
  };

  await closeBag();
  await goToMap("kanto-celadon-mart", 4, 3, 60);
  expect("タマムシデパートに 入れた", (await spot()).map, "kanto-celadon-mart");
  await talkToObject("kanto-celadon-mart", "dept-guide");

  const deptItems = await dept("kanto-celadon-dept-2f", { x: 3, y: 4 }, "ArrowLeft", "デパート2階");
  expect(
    "2階で ハイパーボールが 買える",
    deptItems.some((t) => t.includes("ハイパーボール")) ? "ある" : "ない",
    "ある",
  );

  const deptTms = await dept("kanto-celadon-dept-3f", { x: 3, y: 4 }, "ArrowLeft", "デパート3階");
  expect(
    "3階で わざマシンが 買える",
    deptTms.some((t) => t.includes("わざマシン")) ? "ある" : "ない",
    "ある",
  );

  const stones = await dept("kanto-celadon-dept-4f", { x: 3, y: 4 }, "ArrowLeft", "デパート4階");
  expect(
    "つながりのヒモが 売っている",
    stones.some((t) => t.includes("つながりのヒモ")) ? "ある" : "ない",
    "ある",
  );

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

// ── 15.6 地形に働きかける（v1.1-c）──
//
// 釣り・探知・固定シンボル。**どれも「調べる」から始まる**ので、
// 確かめるのは「持っていないと何も起きない／持つと起きる」の対。
{
  /** セーブを書き換えて道具を持たせ、その場に立たせる。 */
  const standAt = async (map, x, y, facing, bag) => {
    await page.click("#open-settings");
    await page.waitForSelector("#save-export");
    await page.click("#save-export");
    const save = JSON.parse(await page.inputValue("#save-text"));
    save.regions.kanto.position = { map, x, y, facing };
    save.global.bag = { ...save.global.bag, ...bag };
    await page.fill("#save-text", JSON.stringify(save));
    await page.click("#save-import");
    await page.waitForTimeout(900);
    await page.click("#settings-back");
    await page.waitForSelector("#field-canvas");
    await page.waitForTimeout(400);
  };
  const said = async () =>
    ((await page.textContent("#field-text").catch(() => "")) ?? "").replace(/\s+/g, " ").trim();

  // ── 釣り ──
  await standAt("kanto-vermilion-city", 6, 10, "down", {});
  await key("z", 1, 500);
  expect(
    "さおが 無いと 水を しらべても 何も おきない",
    (await talking()) ? await said() : "なにも おきない",
    "なにも おきない",
  );

  await standAt("kanto-vermilion-city", 6, 10, "down", { "old-rod": 1 });
  await key("z", 1, 600);
  expect("さおを もつと 水を しらべて つれる", await said(), (v) => v.includes("みずに たらした"));
  await clear(6);
  await page.waitForTimeout(1200);
  expect("釣りから 野生バトルに なる", (await page.isVisible("#battle")) ? "なった" : "ならない", "なった");
  note("つれたもの", ((await page.textContent("#log")) ?? "").trim().split("\n")[0]);
  await fight();
  await page.waitForTimeout(800);
  await drain();

  // ── 隠しアイテム ──
  await standAt("kanto-route-16", 2, 7, "up", {});
  await key("z", 1, 500);
  expect(
    "ダウジングマシンが 無いと 何も みつからない",
    (await talking()) ? await said() : "なにも おきない",
    "なにも おきない",
  );

  await standAt("kanto-route-16", 2, 7, "up", { itemfinder: 1 });
  await key("z", 1, 600);
  expect("ダウジングマシンで しらべると はんのう する", await said(), (v) => v.includes("はんのう"));
  await drain();
  await page.click("#open-bag");
  await page.waitForTimeout(400);
  const afterFind = (await page.textContent("#field-panel")) ?? "";
  expect(
    "うまっていた どうぐを ひろえた",
    afterFind.includes("なんでもなおし") ? "ひろえた" : "ひろえない",
    "ひろえた",
  );
  await page.click("#panel-close");
  await page.waitForTimeout(200);

  // ── 固定シンボル（カビゴン）──
  await standAt("kanto-route-16", 6, 7, "down", {});
  await key("z", 1, 600);
  expect("カビゴンが みちを ふさいでいる", await said(), (v) => v.includes("ねむっている"));
  await clear(6);
  const wake = await page.$$eval("#field-text .choices button", (b) => b.map((x) => x.textContent));
  expect("おこすか どうか えらべる", wake.join("/"), (v) => v.includes("おこす"));
  await page.click("#field-text .choices button:nth-child(1)");
  await page.waitForTimeout(600);
  await clear(6);
  await page.waitForTimeout(1500);
  expect("カビゴンと 野生戦に なる", (await page.isVisible("#battle")) ? "なった" : "ならない", "なった");
  note("あいて", ((await page.textContent("#log")) ?? "").trim().split("\n")[0]);
  await fight();
  await page.waitForTimeout(800);
  await drain();
  const gone = await readSave();
  expect(
    "戦ったあとは もう そこに 居ない",
    gone.regions.kanto.flags["kanto.route16.snorlax-woken"] === true ? "居ない" : "まだ 居る",
    "居ない",
  );
  await shot("22c-field");
}

// ── 化石・道場・イーブイ（v1.1-g-3）──
//
// **コードは1行も足していない。** 図鑑を埋める側の穴を、
// データだけで11種ぶん塞ぐ区間。確かめるのは「もらえる」ではなく
// **「もらったものが手元に残る」**ところまで（givePokemon の行き先は
// 手持ちが満杯ならボックス）。
{
  await powerUp();
  const owns = async (id) => {
    const save = await readSave();
    return Object.values(save.pokemon ?? {}).some((p) => p.species === id);
  };


  // ── おつきみやま B2F の かせき ―― 2つのうち1つだけ ──
  // **かせきは 8,1 に置いてある。立てるのは その左右だけ**
  // （8,2 は岩・調べる相手の上には立てない）
  await goToMap("kanto-mt-moon-b2f", 7, 1, 200);
  expect("おつきみやま 地下2階に 着く", (await spot()).map, "kanto-mt-moon-b2f");
  await talk("ArrowRight");
  await drain(6);
  await choose("かいのかせき");
  await drain(10);
  const bagFossil = (await readSave()).global.bag;
  expect("かいのかせき を もらう", `${bagFossil["helix-fossil"] ?? 0}`, "1");
  expect(
    "もう ひとつは もらえない（1つだけ）",
    `${bagFossil["dome-fossil"] ?? 0}`,
    "0",
  );
  await talk("ArrowUp");
  await drain(6);
  expect(
    "とった あとは かせきが 消えている",
    (await talking()) ? "まだ 出る" : "消えた",
    "消えた",
  );
  await drain(10);

  // ── タマムシマンション ―― イーブイ ──
  await goToMap("kanto-celadon-mansion", 4, 2, 200);
  expect("タマムシマンションに 入れる（扉が 繋がった）", (await spot()).map, "kanto-celadon-mansion");
  await talk("ArrowUp");
  await drain(12);
  expect("イーブイ を もらう", (await owns("eevee")) ? "もらった" : "もらえない", "もらった");
  await shot("37-eevee");

  // ── カラテどうじょう ―― 勝つと どちらか1匹 ──
  await goToMap("kanto-saffron-dojo", 4, 2, 200);
  expect("どうじょうに 入れる", (await spot()).map, "kanto-saffron-dojo");
  await talk("ArrowUp");
  await drain(8);
  expect("カラテおうに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
  await fight();
  await page.waitForTimeout(800);
  await drain(20);
  // 勝つまで、ボールは置かれていない（`if:kanto.dojo.won=true`）
  await goTo(3, 3);
  await key("ArrowUp", 2, 220);
  await key("z", 1, 400);
  await drain(6);
  await choose("もらう");
  await drain(12);
  expect("サワムラー を もらう", (await owns("hitmonlee")) ? "もらった" : "もらえない", "もらった");
  // **もう片方は もらえない。** 選ばせたものを2つとも渡したら選択ではない
  await goTo(5, 3);
  await key("ArrowUp", 2, 220);
  await key("z", 1, 400);
  await drain(8);
  expect(
    "もう 片方は もらえない（えらんだ ほうだけ）",
    (await owns("hitmonchan")) ? "もらえた" : "もらえない",
    "もらえない",
  );
  await shot("38-dojo");
}

// ── サファリゾーン（v1.1-h）──
//
// **その場所だけの規則**が効いているかを見る。仕掛けは4つ:
//   入場料を払う ／ サファリボール以外は投げられない ／
//   技も交代も選べない ／ 歩数が尽きたら追い出される
{
  await powerUp();
  await goToMap("kanto-safari-gate", 3, 3, 120);
  // **サファリの中では歩数を数えるので、自転車をやめて歩きに戻す。**
  // 台本の待ち時間（`stepWait`）と歩行アニメを合わせておかないと、
  // 押した回数と歩いた歩数がずれる
  stepWait = 175;
  /** 画面に出ている のこり歩数（v1.1-h）。出ていなければ空文字。 */
  const stepsLeft = async () =>
    (await page.getAttribute("#field-canvas", "data-steps").catch(() => null)) ?? "";
  expect("セキチクの北に サファリゾーンの ゲートがある", (await spot()).map, "kanto-safari-gate");
  // **所持金を既知の額に揃えてから測る。** ここまでの買い物で0円になっていると
  // `takeMoney` は有るぶんだけ取って通す（`Math.min`）ので、
  // 「500円 はらった」の検査が財布の中身しだいで通ったり落ちたりする ――
  // 測りたいのは入場料の機構であって、道中いくら使ったかではない。
  // 実際0円で1回落ちて、そのとき**0円でも入れてしまう**穴も見つかった
  await setMoney(2000);
  const before = (await readSave()).regions.kanto.money;
  expect("所持金を そろえられた", `${before}`, "2000");
  await key("ArrowUp", 2, 220);
  await key("z", 1, 400);
  await choose("はいる");
  await drain(10);
  expect("入場料を はらうと 中に 入れる", (await spot()).map, "kanto-safari-middle");
  const bag = (await readSave()).global.bag;
  expect("サファリボールを 30こ もらう", `${bag["safari-ball"] ?? 0}`, "30");
  const after = (await readSave()).regions.kanto.money;
  expect("入場料 500円 を はらう", `${before - after}`, "500");
  await shot("30-safari");

  // ── 戦えない場所の戦い ──
  //
  // **草の列まで歩いてから上下する。** 降りた 6,10 から真上は y=8,9 とも
  // 通路（`.`）で、そこで上下しても草を1マスも踏まない ―― 実際それで
  // 1回、野生に出会わないまま素通りした。**座標は地図を数えて決める。**
  //   y=8,9 の草は x=3,4,5 と x=8,9,10
  await key("ArrowLeft", 3, RIDING_MS); // 6,10 → 4,10
  await key("ArrowUp", 3, RIDING_MS); // 4,10 → 4,8（草）
  let wild = false;
  for (let i = 0; i < 40 && !wild; i += 1) {
    await key(i % 2 === 0 ? "ArrowDown" : "ArrowUp", 2, RIDING_MS); // 4,9 ⇄ 4,8 どちらも草
    wild = await page.isVisible("#battle");
  }
  expect("くさむらで 野生に 出会う", wild ? "出会った" : "出会わない", "出会った");
  if (wild) {
    // **「技が出ない」だけでは足りない。** 出ないのか出し忘れているのかは
    // 画面から見分けがつかないので、**代わりに何が出ているか**まで見る
    const slots = await page.$$eval("#controls .move .mname", (b) => b.map((x) => x.textContent));
    expect("技のかわりに エサと イシだけが 並ぶ", slots.join("/"), "エサ/イシ");
    expect("こうたいは 選べない", (await page.$$("#controls .switch")).length === 0 ? "選べない" : "選べる", "選べない");
    const balls = await page.$$eval("#controls .ball .mname", (b) => b.map((x) => x.textContent));
    expect("投げられるのは サファリボールだけ", balls.join("/"), "サファリボール");
    await shot("30b-safari-battle");

    // **戦っているあいだ セーブを読まない。**
    // `readSave()` は設定画面を開いて閉じるので、バトル中に呼ぶと
    // `#controls` が隠れたまま戻ってこない ―― エサのボタンを30秒待って
    // 落ちていたのはこれで、バトル側の不具合ではなかった。
    // のこり数はボタン（「のこり Nこ」）から読む
    const ballCount = async () => {
      const meta = (await page.textContent("#controls .ball .meta").catch(() => null)) ?? "";
      return Number(meta.replace(/[^0-9]/g, "")) || 0;
    };
    const ballsBefore = await ballCount();
    expect("ボタンに のこり数が 出る", `${ballsBefore}`, "30");

    // **ボールを先に1つ投げる。** イシを先にすると、逃げられた回に
    // ボールを1つも投げないまま戦いが終わり、「投げたぶんだけ減る」が
    // 0 == 0 で通ってしまう ―― 通っているのに何も測っていない。
    // 実際1回そうなった（イシ → おこった → にげられた）
    let thrown = 0;
    {
      const ball = await page.$("#controls .ball");
      if (ball !== null) {
        await ball.click();
        thrown += 1;
        await page.waitForTimeout(1400);
        await drain(10);
      }
    }

    // イシ（捕まえやすく・逃げやすく）を1回投げる。
    // **並び順ではなく名前で押す。** `:nth-child(2)` で押していたら、
    // 回によって エサ が飛んで「イシを なげた」と記録していた ――
    // 押した物と記録が食い違う検査は、通っても意味が無い
    const throwRock = page.locator("#controls .move", { hasText: "イシ" }).first();
    if ((await throwRock.count()) > 0) {
      await throwRock.click();
      await page.waitForTimeout(900);
      await drain(8);
      note("イシを なげたあと", ((await page.textContent("#log")) ?? "").trim().split("\n").at(-1) ?? "");
    }

    // 残りを投げる。**捕れるか逃げられるかは運**なので、そこは判定にしない ――
    // 判定にするのは「投げたぶんだけ確実に減る」ほう（サファリボールの経路そのもの）
    for (let i = 0; i < 10 && (await page.isVisible("#battle")); i += 1) {
      const ball = await page.$("#controls .ball");
      if (ball === null) break;
      await ball.click();
      thrown += 1;
      await page.waitForTimeout(1400);
      await drain(10);
    }
    // **捕れないまま終わらないことがある。** 満タンの相手に エサ を当てると
    // 捕獲率が半分になり、10回投げても捕れずに残る ―― そこで台本が
    // バトル中に `readSave()` を呼んで画面を壊していた。
    // にげる もサファリの正当な手なので、最後はそれで畳む
    if (await page.isVisible("#battle")) {
      await page.click("#controls .run").catch(() => {});
      await page.waitForTimeout(1500);
      await drain(10);
    }
    expect("戦いは 終わる（捕るか 逃げるか 逃げられるか）", (await page.isHidden("#battle")) ? "終わった" : "終わらない", "終わった");
    await drain(10);
    const ballsAfter = (await readSave()).global.bag["safari-ball"] ?? 0;
    expect("投げたぶんだけ サファリボールが 減る", `${ballsBefore - ballsAfter}`, `${thrown}`);
    expect("すくなくとも 1つは 投げている", `${thrown}`, (v) => Number(v) >= 1);
    note("投げた回数", `${thrown}回 / のこり ${ballsAfter}こ`);
  }

  // ── 歩数（v1.1-h の眼目）──
  //
  // **数え直す単位はマップではなく区画。** 中央を歩き、西へ移り、また歩いて
  // 合計500歩で追い出される ―― マップが変わるたびに数え直していたら、西へ入った
  // 時点で満タンに戻り、上限まで回しても追い出されない。
  // **「そこしか通れない」で初めて関門になる**のと同じで、
  // 歩数制限は**尽きて初めて**制限になる。だから確かめるのは「尽きること」。
  //
  // 歩くのは草も水も無い行だけ（中央 y=10 ／ 西 y=4）―― 野生戦が挟まると
  // 何歩あるいたのか分からなくなる。
  //
  // **歩数の会計に、ここまで歩いたぶんも入っている。** 野生を探して上下した
  // ぶんも goToMap の経路もサファリの歩数を食うので、中央で使いすぎると
  // 西へ渡る前に尽きて「西のエリアへ移れる」が落ちる ―― 中央は控えめにして、
  // **残りは西で尽きるまで回す**（西の上限22往復＝440歩。区画で数えていなければ
  // 西だけで500歩＝25往復要るので、上限に当たって落ちる）。
  await goToMap("kanto-safari-middle", 1, 10, 40);
  // **左端に戻って終わる向きにする。** 「左へ→右へ」だと1往復ごとに
  // **右端**で終わり、そこから左の warp へ向かったつもりで逆方向へ歩いていた ――
  // 5往復したあと西へ渡れず、中央に居たまま歩数だけ使っていた。
  // 往復の向きは、次にどちらへ行くかとセットで決めないといけない
  //
  // **待ち時間は歩きに合わせる。** `RIDING_MS`(95ms) は自転車の歩行アニメ(62ms)
  // に合わせた値で、歩き(130ms)より短い ―― 乗っていない場所で使うと
  // 次のキーが歩行中に飛んで捨てられ、押した回数ぶん歩かない。
  // **歩数を数える区間で、歩数が入力回数と合わないのは致命的。**
  const lap = async (span) => {
    // 向きが違う1回目は「向き直り」で歩数を使わない（movement.ts）ので +1 押す
    await key("ArrowRight", span + 1, stepWait);
    await key("ArrowLeft", span + 1, stepWait);
  };
  for (let i = 0; i < 5; i += 1) await lap(10); // 100歩ぶん

  // **場所を合わせるのに キーの回数を数えない。**
  //
  // `key(dir, n)` が何マス進むかは**押す前の向きで変わる** ―― 違う向きなら
  // 1回目は「向き直り」で進まず n-1 マス、同じ向きなら n マス。
  // 5回押して 1,6 に居るつもりが 1,5 に居て、そこから左は壁（y=5 の x=0 は T）。
  // 一生ぶつかっていた。**位置合わせは道具に引かせ、キーは歩数を使う用だけにする。**
  note("西の 出口へ 向かう前", `${(await spot()).raw} / のこり ${(await stepsLeft()) || "—"}歩`);
  await goToMap("kanto-safari-west", 11, 6, 40);
  expect("西の エリアへ 移れる", (await spot()).map, "kanto-safari-west");
  await goToMap("kanto-safari-west", 11, 4, 20); // 西の通路の行へ

  note("西に 入った時点の のこり歩数", (await stepsLeft()) || "（表示なし）");
  expect(
    "エリアを跨いでも 数え直さない（500歩から 減ったまま）",
    (await stepsLeft()) === "" ? "表示なし" : Number(await stepsLeft()) < 500 ? "減っている" : "500に戻った",
    "減っている",
  );

  // 上限は緩めでよい ―― **「数え直さない」は歩数を直接読んで見ている**ので、
  // ここで見たいのは「いつかは尽きる」だけ
  // **セーブ画面を開いて閉じても、歩数は戻らない。**
  // `#open-settings` はフィールドを作り直す（`main.ts` の `showField`）ので、
  // 歩数を `playField` の中に置いていたら、メニューを開くだけで500歩に戻った ――
  // 歩数制限を無効にする手順が、遊ぶ側の手元にあった
  {
    const kept = await stepsLeft();
    await readSave();
    expect("メニューを 開いて 閉じても 歩数は 戻らない", await stepsLeft(), kept);
  }

  let laps = 0;
  while (laps < 40 && (await spot()).map === "kanto-safari-west") {
    await lap(10);
    laps += 1;
    await drain(8);
  }
  note("西で 歩いた 往復", `${laps}往復 / のこり歩数 ${(await stepsLeft()) || "—"}`);
  expect(
    "500歩で 追い出される（エリアを跨いでも 数え直さない）",
    (await spot()).map,
    "kanto-safari-gate",
  );
  const out = await readSave();
  expect(
    "外に 出たので 規則は 効いていない",
    out.regions.kanto.flags["kanto.safari.inside"] === true ? "まだ 中" : "外に 出た",
    "外に 出た",
  );
  expect("外では のこり歩数を 出さない", (await stepsLeft()) || "表示なし", "表示なし");
  stepWait = RIDING_MS; // サファリを出たら、また自転車の速さに戻す
}

// ── サイクリングロード（v1.1-g-2）──
//
// 16番からセキチクへは、**17番・18番を通らないと行けない**ようになった
// （それまでは16番が直接セキチクに繋がっていた ―― 原作より1本短かった）。
await goToMap("kanto-route-17", 5, 6, 120);
expect("16番の南は サイクリングロード（17番）", (await spot()).map, "kanto-route-17");
await goToMap("kanto-route-18", 5, 4, 60);
expect("17番の南は 18番どうろ", (await spot()).map, "kanto-route-18");

// キョウ（ジム5）。**ジムの前にポケモンセンターへ寄る** ―― 人がやることと同じ
await goToMap("kanto-fuchsia-pokecenter", 4, 3, 80);
await talk("ArrowUp");
await drain();
// ── 見えない壁（v1.1-g）──
//
// **床にしか見えないのに通れない。** 検証はこれを見つけられない ――
// 「通れないマスがある」のは正しい状態でしかないので、
// *見た目と規則が食い違っている*ことは、遊んでしか確かめられない。
// **先にジムの中のトレーナーを片付ける。** 視線に入ったまま調べると
// バトルが割り込み、「動けなかった」のか「戦っていた」のか区別できない
await powerUp();
await goToMap("kanto-fuchsia-gym", 4, 9, 80);
{
  const before = await spot();
  // ここから真上（4,8）は床に見えるが**見えない壁**
  await key("ArrowUp", 3, 200);
  const after = await spot();
  expect(
    "床に 見えるのに 通れない（見えない壁）",
    `${after.x},${after.y}`,
    `${before.x},${before.y}`,
  );
}
await shot("22d-invisible-wall");

expect(
  "キョウに 勝つと バッジが 5つに なる",
  await challengeGym("キョウ", "kanto-fuchsia-gym", 6, 1, 5, "ArrowRight"),
  (v) => v > 0,
);
await shot("23-five-badges");

// バッジ5つになったので、警備員が通す
await goToMap("kanto-saffron-city", 5, 5, 80);
await talk("ArrowUp");
await drain(6);
await goToMap("kanto-saffron-city", 5, 5, 40);
await talk("ArrowUp");
await drain(6);
// ── テレポート床（v1.1-g）──
//
// 9つの小部屋は壁で完全に切れていて、**床を踏む以外に行き来する道が無い。**
// 仕掛けはコード0行 ―― `Warp.to.map` に自分自身のマップIDを書いただけ。
await powerUp();
await goToMap("kanto-saffron-gym", 6, 11, 80);
{
  const before = await spot();
  await goToMap("kanto-saffron-gym", 6, 7, 20);
  const after = await spot();
  expect(
    "テレポート床を 踏むと 別の部屋に 飛ぶ",
    `${after.map} ${after.x},${after.y}`,
    `kanto-saffron-gym 6,7`,
  );
  expect(
    "飛んだ先は 歩いて来られない部屋",
    Math.abs(after.y - before.y) > 2 ? "はなれている" : "となり",
    "はなれている",
  );
}
await shot("24b-teleport");

expect(
  "バッジ5つで ヤマブキジムに 入れて、勝つと 6つに なる",
  await challengeGym("ナツメ", "kanto-saffron-gym", 6, 3, 6),
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
// **見えないボタンを押して落ちない。** 1本の脚が折れただけで
// 残り全部が見えなくなるのは、道具として損（v1.1-g-3）
if (await page.isVisible("#open-fly")) await page.click("#open-fly");
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

// ── クイズ扉（v1.1-g）──
//
// **間違えたら開かない**ところまで確かめる。正解だけ試すと、
// 「どちらを選んでも開く扉」を通してしまう ―― v1.1-e の
// 「置いただけの関門」と同じ形の見落としになる。
await powerUp();
await goToMap("kanto-cinnabar-gym", 4, 8, 80);
{
  // わざと間違える（クイズ1の正解は ○）
  await key("ArrowUp", 2, 200);
  await key("z", 1, 400);
  await choose("×");
  await drain(6);
  await goToMap("kanto-cinnabar-gym", 4, 6, 6);
  expect("まちがえると 扉は 開かない", `${(await spot()).y}`, "8");

  // 3つとも正解する
  const ANSWERS = ["○", "×", "○"];
  for (const [i, answer] of ANSWERS.entries()) {
    await goToMap("kanto-cinnabar-gym", 4, [8, 5, 3][i], 20);
    await key("ArrowUp", 2, 200);
    await key("z", 1, 400);
    await choose(answer);
    await drain(6);
  }
  await goToMap("kanto-cinnabar-gym", 4, 1, 20);
  expect("3つとも 正解すると カツラの部屋に 着く", `${(await spot()).y}`, "1");
}
await shot("28b-quiz");

expect(
  "カツラに 勝つと バッジが 7つに なる",
  await challengeGym("カツラ", "kanto-cinnabar-gym", 6, 1, 7, "ArrowRight"),
  (v) => v > 0,
);

// ── ロケット団の筋（v1.1-g-3-2）──
//
// ゲームコーナー → アジト → シルフスコープ → ポケモンタワー7階 → シルフ。
// **v0.12 でタワーの階を送ったとき「足りないのはシルフスコープの入手元だけ」
// と書いた宿題が、ここで解ける。**
{
  await powerUp();
  const owns = async (id) => {
    const save = await readSave();
    return Object.values(save.pokemon ?? {}).some((p) => p.species === id);
  };
  const bag = async () => (await readSave()).global.bag;

  // ── ゲームコーナー ―― 景品は お金で買う（コインは作らない）──
  await setMoney(20000);
  await goToMap("kanto-celadon-gamecorner", 5, 7, 200);
  expect("ゲームコーナーに 入れる", (await spot()).map, "kanto-celadon-gamecorner");
  await talkToObject("kanto-celadon-gamecorner", "gamecorner-clerk");
  await drain(8);
  await choose("ケーシィ");
  await drain(12);
  expect("けいひんの ケーシィ を おかねで もらえる", (await owns("abra")) ? "もらった" : "もらえない", "もらった");
  await shot("40-gamecorner");

  // **ポスターを押すまで、階段は塞がっている。**
  // 「置いた」ではなく「そこしか通れない」で初めて関門になる
  expect(
    "ポスターを 押すまで 階段は 塞がっている",
    (await goToMap("kanto-rocket-b1f", 5, 1, 6)).map,
    "kanto-celadon-gamecorner",
  );
  await talkToObject("kanto-celadon-gamecorner", "gamecorner-poster");
  await drain(10);
  await goToMap("kanto-rocket-b1f", 5, 1, 20);
  expect("ポスターを 押すと アジトへ 降りられる", (await spot()).map, "kanto-rocket-b1f");

  // ── アジト ―― エレベーターのカギが無いと 地下4階へ行けない ──
  await goToMap("kanto-rocket-b3f", 2, 1, 120);
  expect("地下3階まで 降りられる", (await spot()).map, "kanto-rocket-b3f");
  expect(
    "カギが 無いと 地下4階へ 行けない",
    (await goToMap("kanto-rocket-b4f", 2, 1, 6)).map,
    "kanto-rocket-b3f",
  );
  // カギは 3,3 に落ちている道具 ―― **踏めば拾う**（話しかけるものではない）
  await goToMap("kanto-rocket-b3f", 1, 7, 20);
  await drain(10);
  expect("エレベーターのカギ を ひろう", `${(await bag())["lift-key"] ?? 0}`, "1");
  await goToMap("kanto-rocket-b4f", 2, 1, 40);
  expect("カギを 取ると 地下4階へ 行ける", (await spot()).map, "kanto-rocket-b4f");

  await talkToObject("kanto-rocket-b4f", "rocket-boss");
  await drain(10);
  expect("サカキに いどめる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
  await fight();
  await page.waitForTimeout(800);
  await drain(24);
  expect("勝つと シルフスコープ が 手に入る", `${(await bag())["silph-scope"] ?? 0}`, "1");
  await shot("41-hideout");

  // ── ポケモンタワー ―― 見えなかったものが 見える ──
  await goToMap("kanto-pokemon-tower-3f", 4, 4, 200);
  expect("タワーの 3階まで 登れる", (await spot()).map, "kanto-pokemon-tower-3f");
  await talkToObject("kanto-pokemon-tower-3f", "tower-3f-ghost-seen");
  await drain(8);
  expect(
    "シルフスコープが あると ゆうれいと 戦える",
    (await page.isVisible("#battle")) ? "戦えた" : "戦えない",
    "戦えた",
  );
  await fight();
  await page.waitForTimeout(800);
  await drain(20);
  await shot("42-tower");

  await goToMap("kanto-pokemon-tower-7f", 4, 2, 120);
  expect("さいじょうかいに 着く", (await spot()).map, "kanto-pokemon-tower-7f");
  await talkToObject("kanto-pokemon-tower-7f", "tower-fuji");
  await drain(20);
  expect("フジろうじんが ポケモンのふえ を くれる", `${(await bag())["poke-flute"] ?? 0}`, "1");

  // ── シルフカンパニー ―― ラプラスと マスターボール ──
  //
  // ポケモンタワーの7階から一息にヤマブキまで歩かせると届かない（実測200回）。
  // **シオン → ヤマブキ → 建物の中**と目印を踏む
  await travel([
    ["kanto-lavender-town", 7, 5],
    ["kanto-saffron-city", 11, 6],
    ["kanto-silph-5f", 2, 1],
  ]);
  expect("シルフの 5階まで 登れる", (await spot()).map, "kanto-silph-5f");
  expect(
    "カードキーが 無いと 7階へ 行けない",
    (await goToMap("kanto-silph-7f", 2, 1, 6)).map,
    "kanto-silph-5f",
  );
  // **わざと失敗させた検査は、失敗したあとの立ち位置を決めない**（v1.1-k）。
  // 上の「7階へ行けない」は6回ぶん歩き回ってから諦めるので、次の一歩は
  // どこから始まるか分からない ―― 実際 (5,2) に取り残され、
  // そこは**団員が塞ぐ側**だったので、カードキーへ20回引き直して届かなかった。
  // 先に団員を片付けて、立ち位置を決め直す
  await talkToObject("kanto-silph-5f", "silph-5f-grunt");
  await drain(8);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(800);
    await drain(12);
  }
  // カードキーは 1,3 に落ちている道具 ―― 踏めば拾う
  await goToMap("kanto-silph-5f", 1, 3, 40);
  await drain(10);
  expect("カードキー を ひろう", `${(await bag())["card-key"] ?? 0}`, "1");
  await goToMap("kanto-silph-7f", 2, 1, 40);
  expect("カードキーを 取ると 7階へ 行ける", (await spot()).map, "kanto-silph-7f");
  // 7階も5階と同じ形 ―― **団員が1マス幅の通路に立っている**ので、
  // 社員へ回り込む前に片付ける（v1.1-k）
  await talkToObject("kanto-silph-7f", "silph-7f-grunt");
  await drain(8);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(800);
    await drain(12);
  }
  await talkToObject("kanto-silph-7f", "silph-7f-staff");
  await drain(12);
  expect("しゃいんが ラプラス を くれる", (await owns("lapras")) ? "もらった" : "もらえない", "もらった");

  await talkToObject("kanto-silph-11f", "silph-boss");
  await drain(10);
  expect("シルフで サカキに 再戦できる", (await page.isVisible("#battle")) ? "いどめた" : "いどめない", "いどめた");
  await fight();
  await page.waitForTimeout(800);
  await drain(24);
  await talkToObject("kanto-silph-11f", "silph-president");
  await drain(16);
  expect("しゃちょうが マスターボール を くれる", `${(await bag())["master-ball"] ?? 0}`, "1");
  await shot("43-silph");
}

// ── グレンけんきゅうじょ ―― かせきを もどす（v1.1-g-3）──
//
// **ここに置くのは、グレンじまが 島だから。** なみのり を覚えるまで
// 辿りつけないので、かせきを拾う区間（おつきみやま）とは離れる ――
// 拾う場所と使う場所が地図の端と端にあるのは、原作もそう。
{
  const owns = async (id) => {
    const save = await readSave();
    return Object.values(save.pokemon ?? {}).some((p) => p.species === id);
  };
  const caught = async () => Object.keys((await readSave()).global.dex ?? {});
  await goToMap("kanto-cinnabar-lab", 4, 2, 120);
  expect("グレンけんきゅうじょに 入れる", (await spot()).map, "kanto-cinnabar-lab");
  await talk("ArrowUp");
  await drain(24);
  expect("かいのかせき が オムナイトに もどる", (await owns("omanyte")) ? "もどった" : "もどらない", "もどった");
  expect("ひみつのコハク が プテラに もどる", (await owns("aerodactyl")) ? "もどった" : "もどらない", "もどった");
  await shot("36-lab");
  // **2回目は起きない。** かせきはバッグに残る（takeItem が無い）ので、
  // 止めているのはフラグ。そこが効いているかを見る
  const before2 = (await caught()).length;
  await talk("ArrowUp");
  await drain(24);
  expect("もう 一度 話しても 増えない", `${(await caught()).length}`, `${before2}`);
}

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
await goToMap("kanto-victory-road", 3, 11, 30);
expect("バッジ8つで チャンピオンロードに 入れる", (await spot()).map, "kanto-victory-road");

// **3階建てになった**（v1.1-e）。1階の かいりき の岩をどけないと上の階へ行けない
expect(
  "かいりき の岩を どけるまで 抜けられない",
  (await goToMap("kanto-indigo-plateau", 4, 9, 6)).map,
  "kanto-victory-road",
);
// 岩は1階の縦道（1,4）にある。立てるのは下どなり（1,5）だけ
await goToMap("kanto-victory-road", 1, 5, 30);
await useAbility("ArrowUp", "kanto-victory-road:victory-boulder");
await goToMap("kanto-victory-road-2f", 2, 6, 40);
expect("2階へ のぼれる", (await spot()).map, "kanto-victory-road-2f");

// ── 押せる岩とスイッチ（v1.1-f）──
//
// **2階と3階は「岩をスイッチに乗せる」以外の道が無い。** v1.1-e の時点では
// 2階も部屋が輪になっていて、岩を通らずに階段へ行けた（＝飾りだった）。
expect(
  "スイッチを 押すまで シャッターは 開かない",
  (await goToMap("kanto-victory-road-3f", 2, 1, 8)).map,
  "kanto-victory-road-2f",
);
await pushBoulder("kanto-victory-road-2f", "victory-2f-boulder", "ArrowRight", 2);
note("スイッチ", ((await page.textContent("#field-text")) ?? "（何も出ない）").trim().replace(/\s+/g, " "));
await accept();
await clear();
await goToMap("kanto-victory-road-3f", 2, 1, 40);
expect("シャッターが 開いて 3階へ のぼれる", (await spot()).map, "kanto-victory-road-3f");

// 3階も同じ仕掛け。**ここで増えたコードは0行**（マップの3行だけ）
expect(
  "3階にも 同じ仕掛けがある",
  (await goToMap("kanto-indigo-plateau", 4, 9, 8)).map,
  "kanto-victory-road-3f",
);
await pushBoulder("kanto-victory-road-3f", "victory-3f-boulder", "ArrowRight", 2);
await accept();
await clear();
await goToMap("kanto-indigo-plateau", 4, 9, 60);
expect("チャンピオンロードを 抜けて セキエイこうげんに つく", (await spot()).map, "kanto-indigo-plateau");
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
// 押した岩も同じ（v1.1-f）。**フラグだけが残り、岩は初期位置に戻る**
for (const k of Object.keys(pushedAt)) delete pushedAt[k];
await page.click("#open-fly");
await page.waitForSelector('#field-panel [data-fly="kanto-pallet-town"]');
await page.click('#field-panel [data-fly="kanto-pallet-town"]');
await drain();
await page.waitForTimeout(800);
expect("そらをとぶ で マサラへ 戻れる", (await spot()).map, "kanto-pallet-town");

// ── 殿堂入りのあと ―― ハナダのどうくつが開く（v1.1-g-2）──
{
  await goToMap("kanto-cerulean-cave", 6, 7, 200);
  expect("殿堂入りすると けいびが どく", (await spot()).map, "kanto-cerulean-cave");
  // ミュウツーは (6,1)。真下（6,2）は壁なので、**横に立って調べる**
  await goToMap("kanto-cerulean-cave", 5, 1, 20);
  await key("ArrowRight", 2, 220);
  await key("z", 1, 400);
  note("ミュウツー", ((await page.textContent("#field-text")) ?? "（何も出ない）").trim().replace(/\s+/g, " "));
  await choose("ちかづく");
  await drain(8);
  expect("ミュウツーと 野生戦に なる", (await page.isVisible("#battle")) ? "なった" : "ならない", "なった");
  await fight();
  await page.waitForTimeout(900);
  await drain(30);
  await shot("33-mewtwo");
}
// ── ナナシマ 1〜3のしま（v1.1-j）──
//
// **v1.1 の完了条件がここで閉じる。** カントー151種の残り3種
// （ポニータ・ギャロップ・ブーバー）は FRLG でナナシマへ移った種なので、
// この区間を歩けないかぎり図鑑は永久に埋まらない。
//
// 走らせる場所を殿堂入りの後にしたのは、**シルフを解いた印**（マサキが誘う条件）が
// もう立っているから ―― 本編の途中に差し込むと、順番の前提を1つ増やすことになる。
{
  await flyTo("kanto-vermilion-city");
  await goToMap("kanto-vermilion-ferry", 4, 5, 80);
  expect("クチバの ふなつきばに 入れる", (await spot()).map, "kanto-vermilion-ferry");

  // **まず塞がっていることを見る。** 開いた側だけ見ても関門の検査にならない
  await refreshFlags();
  expect(
    "はじめは まだ しゅっこうできない",
    liveFlags.has("kanto.sevii.invited") ? "乗れる" : "乗れない",
    "乗れない",
  );
  // **話しかけた跡は残らない。** `talkToObject` は最後に `drain()` するので、
  // 直後に `#field-text` を読んでも空になる ―― せんいんが居ること自体は
  // 上の `expect`（乗れない）が見ているので、ここでは押し込むだけにする
  await talkToObject("kanto-vermilion-ferry", "vermilion-ferry-sailor");
  await drain(8);

  await talkToObject("kanto-vermilion-ferry", "vermilion-ferry-bill");
  await drain(14);
  await refreshFlags();
  expect(
    "マサキに 話すと しゅっこうできる",
    liveFlags.has("kanto.sevii.invited") ? "乗れる" : "乗れない",
    "乗れる",
  );

  await goToMap("kanto-sevii-one-island", 6, 6, 120);
  expect("シーギャロップごうで 1のしまに つく", (await spot()).map, "kanto-sevii-one-island");
  await shot("35-sevii-one-island");

  // ── ほのおのみち ―― ポニータ が居る道で野生に会う ──
  await goToMap("kanto-sevii-kindle-road", 3, 2, 120);
  expect("ほのおのみちに 出られる", (await spot()).map, "kanto-sevii-kindle-road");
  let sevWild = null;
  for (let i = 0; i < 40 && sevWild === null; i += 1) {
    if (i % 8 === 0) await goToMap("kanto-sevii-kindle-road", 3, 2, 10);
    await key(i % 2 === 0 ? "ArrowRight" : "ArrowLeft", 2, 200);
    if (await page.isVisible("#battle")) sevWild = (await page.textContent("#log")).trim().split("\n")[0];
  }
  note("ほのおのみちの 野生", sevWild ?? "でなかった");
  expect("ナナシマでも 野生が 出る", sevWild ?? "でなかった", (v) => v.includes("とびだしてきた"));
  const runAway = await page.$("#controls .run");
  if (runAway) {
    await runAway.click();
    await page.waitForTimeout(1500);
  }
  await drain(20);

  // ── ともしびやま ―― ロケット団2人が ルビーのどうくつ を塞ぐ ──
  await goToMap("kanto-sevii-mt-ember", 6, 5, 160);
  expect("ともしびやまに 登れる", (await spot()).map, "kanto-sevii-mt-ember");
  await shot("36-sevii-mt-ember");
  for (const grunt of ["ember-rocket-2", "ember-rocket-1"]) {
    await goToMap("kanto-sevii-mt-ember", 6, 5, 40);
    await talkToObject("kanto-sevii-mt-ember", grunt);
    await drain(8);
    if (await page.isVisible("#battle")) await fight();
    await page.waitForTimeout(900);
    await drain(20);
  }
  await refreshFlags();
  expect(
    "2人とも 倒すと 道が あく",
    liveFlags.has("kanto.sevii.rocket-1-beaten") && liveFlags.has("kanto.sevii.rocket-2-beaten")
      ? "あいた"
      : "あかない",
    "あいた",
  );

  // ── ルビーのどうくつ 地下3階 ―― ルビー と マグカルゴ ──
  // **ルビーの真下は岩。** 立てるのは左右だけなので、立つマスは `talkToObject` に選ばせる
  await goToMap("kanto-sevii-ruby-path-b3f", 3, 5, 260);
  expect("ルビーのどうくつ 地下3階まで 降りられる", (await spot()).map, "kanto-sevii-ruby-path-b3f");
  await talkToObject("kanto-sevii-ruby-path-b3f", "ruby-stone");
  await drain(10);
  const bagRuby = (await readSave()).global.bag;
  expect("ルビー を 拾う", `${bagRuby["ruby"] ?? 0}`, "1");
  await shot("37-sevii-ruby");

  // ── セリオ に 渡す ──
  // **(4,3) は機械の上**（`W..CCC..W` の C）。1回目の走行はここを狙って
  // 「経路なし」になり、**次の検査が `talkToObject` の力で通ってしまった** ――
  // 壊れた足取りが、後ろの成功で隠れる形。立てるマスを狙う
  await goToMap("kanto-sevii-network-center", 4, 4, 260);
  expect("ネットワークセンターに 戻れる", (await spot()).map, "kanto-sevii-network-center");
  await talkToObject("kanto-sevii-network-center", "network-celio");
  await drain(14);
  await refreshFlags();
  expect(
    "ルビーを 渡すと マシンが うごく",
    liveFlags.has("kanto.sevii.celio-done") ? "うごいた" : "うごかない",
    "うごいた",
  );

  // ── 港の鎖 ―― 3のしまの みなと（ノコッチ の居場所）まで辿れるか ──
  await goToMap("kanto-sevii-three-isle-port", 6, 5, 300);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(900);
    await drain(20);
    await goToMap("kanto-sevii-three-isle-port", 6, 5, 60);
  }
  expect(
    "ふなつきばを 3つ つないで 3のしまの みなとまで 行ける",
    (await spot()).map,
    "kanto-sevii-three-isle-port",
  );
  await shot("38-sevii-three-port");

  // ── 4〜7のしま（v1.1-k）―― 氷の床と サファイア ──
  //
  // 東の航路は殿堂入り後にだけ開く。**台本はもう殿堂入りしている**ので、
  // ここで確かめるのは「開いていること」の側だけ ――
  // 閉じている側は、殿堂入り前に通る区間が無いので見られない（世界の側の正しさは #108 が見る）。
  await goToMap("kanto-sevii-four-island", 6, 6, 260);
  expect("殿堂入りすると 4のしまへ 渡れる", (await spot()).map, "kanto-sevii-four-island");
  await shot("39-sevii-four-island");

  // **氷の床。1入力で複数マス動く唯一の場所**（v1.1-k）。
  // 手順は「東を上がって突き当たる → 左へ滑って岩に当たる → 1歩上がる」
  await goToMap("kanto-sevii-icefall-1f", 11, 7, 300);
  expect("こおりのぬけみち 1階に 入れる", (await spot()).map, "kanto-sevii-icefall-1f");
  await key("ArrowUp", 2, 420);
  const slidUp = await spot();
  note("氷を滑った先", `${slidUp.x},${slidUp.y}`);
  expect("氷に乗ると 止まれるところまで 一気に すべる", `${slidUp.x},${slidUp.y}`, "11,2");
  await key("ArrowLeft", 2, 420);
  const slidLeft = await spot();
  expect("岩に あたって 止まる", `${slidLeft.x},${slidLeft.y}`, "9,2");
  await shot("40-sevii-ice");

  // 滑走を織り込んだ経路探索が、氷の部屋を抜けられるか（**台本の側の検査**）
  await goToMap("kanto-sevii-icefall-b1f", 9, 1, 60);
  expect("氷を抜けて 地下1階へ 降りられる", (await spot()).map, "kanto-sevii-icefall-b1f");

  // ── サファイア の筋 ―― 奪われて、取り返して、渡す ──
  await goToMap("kanto-sevii-dotted-hole", 4, 5, 300);
  expect("ドットのあな に入れる", (await spot()).map, "kanto-sevii-dotted-hole");
  await talkToObject("kanto-sevii-dotted-hole", "dotted-sapphire");
  await drain(14);
  await refreshFlags();
  expect(
    "サファイアは 目の前で 奪われる",
    liveFlags.has("kanto.sevii.sapphire-stolen") ? "奪われた" : "何も起きない",
    "奪われた",
  );

  await talkToObject("kanto-sevii-five-isle-meadow", "meadow-grunt");
  await drain(14);
  await refreshFlags();
  expect(
    "見張りが 合言葉を 口走る",
    liveFlags.has("kanto.sevii.warehouse-open") ? "開いた" : "開かない",
    "開いた",
  );

  await goToMap("kanto-sevii-rocket-warehouse", 4, 4, 120);
  if (await page.isVisible("#battle")) {
    await fight();
    await page.waitForTimeout(900);
    await drain(20);
  }
  expect("そうこに 入れる", (await spot()).map, "kanto-sevii-rocket-warehouse");
  await talkToObject("kanto-sevii-rocket-warehouse", "warehouse-sapphire");
  await drain(10);
  const bagSapphire = (await readSave()).global.bag;
  expect("サファイア を 取り返す", `${bagSapphire["sapphire"] ?? 0}`, "1");

  await goToMap("kanto-sevii-network-center", 4, 4, 300);
  await talkToObject("kanto-sevii-network-center", "network-celio");
  await drain(16);
  await refreshFlags();
  expect(
    "ルビーと サファイアで マシンが 完成する",
    liveFlags.has("kanto.sevii.network-complete") ? "完成した" : "まだ",
    "完成した",
  );
  await shot("41-sevii-celio");
}

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

console.log(
  `\n所要 ${((Date.now() - startedAt) / 60000).toFixed(1)} 分 / 検査 ${log.length} 件` +
    `（1歩 ${stepWait}ms）`,
);
console.log(`スクリーンショット: ${SHOTS}`);
console.log(errors.length === 0 ? "JS エラーなし" : `JS エラー ${errors.length} 件:\n${errors.join("\n")}`);
if (errors.length > 0) process.exitCode = 1;
await browser.close();
