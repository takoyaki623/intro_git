/**
 * マップのつながりを1枚にまとめる（v0.12-b）。
 *
 *   npm run mapgraph
 *
 * **手で描かない。** マップが33枚あって、v0.12 の1版で14枚増えた。
 * 手で描いた図はその日のうちに嘘になる ―― `maps.json` から作る。
 *
 * 拾うのは3種類の繋がり:
 *   踏む warp   … 町と道路、建物の出入口
 *   調べる warp … ドアなど（今は無い）
 *   イベント    … 拠点↔地方のゲートだけは warp ではない（v0.10）
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA = "packages/data";
const OUT = process.argv[2] ?? "dist/mapgraph.html";

const read = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
const maps = read("maps.json");
const regions = read("regions.json");
const trainers = read("trainers.json");
const encounters = read("encounters.json");
const events = read("events.json");

const byId = new Map(maps.map((m) => [m.id, m]));
const trainerById = new Map(trainers.map((t) => [t.id, t]));
const encounterById = new Map(encounters.map((e) => [e.id, e]));

/** そのマップが引きうる出現テーブル（v0.12-d で複数持てるようになった）。 */
const tablesOf = (map) =>
  (map.encounters ?? []).map((id) => encounterById.get(id)).filter((t) => t !== undefined);

/**
 * 建物か、外か。
 *
 * **「warp の行き先が1枚しかないマップ」を建物とみなす。**
 * 名前でも凡例でもなく繋がり方で決める ―― 名前で決めると、
 * `-gym` を付け忘れた1枚が黙って外に混ざる。
 */
function parentOf(map) {
  const targets = new Set(map.warps.map((w) => w.to.map));
  if (map.warps.length === 0 || targets.size !== 1) return null;
  const parent = [...targets][0];
  return parent === map.id ? null : parent;
}

const interiorOf = new Map(); // 建物 → 親
for (const map of maps) {
  const parent = parentOf(map);
  if (parent !== null) interiorOf.set(map.id, parent);
}

/** 拠点↔地方のゲート（warp ではなくイベント）。 */
const gateEvents = new Set(
  events
    .filter((e) => JSON.stringify(e).includes("enterRegion") || JSON.stringify(e).includes("returnToHub"))
    .map((e) => e.id),
);
const gates = [];
for (const map of maps) {
  for (const object of map.objects) {
    if (object.event === undefined || !gateEvents.has(object.event)) continue;
    // `returnToHub` は拠点へ、`enterRegion` はその地方の入口へ。
    // **どちらも regions.json / 拠点の入口から引く**（図に手で書いた行き先を残さない）
    const source = JSON.stringify(events.find((e) => e.id === object.event));
    const region = /"enterRegion","region":"([a-z]+)"/.exec(source.replace(/\s/g, ""));
    const target = source.includes("returnToHub")
      ? "hub-plaza"
      : (regions.find((r) => r.id === region?.[1])?.start?.map ?? null);
    // 行き先が建物なら、図では親（町）に畳む ―― 他の線と同じ扱いにする。
    // 地方の入口は「主人公の部屋」なので、畳まないとマサラタウンの中身が図に飛び出す
    const folded = target === null ? null : (interiorOf.get(target) ?? target);
    gates.push({ from: map.id, to: folded, at: object.at, event: object.event });
  }
}

/** 地方の入口からの距離（何枚めか）。並びの根拠にする。 */
function distances(startMap) {
  const seen = new Map([[startMap, 0]]);
  const queue = [startMap];
  while (queue.length > 0) {
    const here = queue.shift();
    const map = byId.get(here);
    if (map === undefined) continue;
    for (const warp of map.warps) {
      if (seen.has(warp.to.map)) continue;
      seen.set(warp.to.map, seen.get(here) + 1);
      queue.push(warp.to.map);
    }
  }
  return seen;
}

/** 親 → ぶら下がっている建物。**種類の判定より先に要る。** */
const insideOf = new Map();
for (const [child, parent] of interiorOf) {
  const list = insideOf.get(parent) ?? [];
  list.push(child);
  insideOf.set(parent, list);
}

const kanto = regions.find((r) => r.id === "kanto");
const depth = distances(kanto.start.map);
for (const map of maps) if (!depth.has(map.id)) depth.set(map.id, 99);

/**
 * マップの種類。色と並びに使う。
 *
 * **ここも名前で決めない。**
 *   まち   … 建物がぶら下がっている外のマップ
 *   どうろ … 建物がぶら下がっていない外のマップ
 *   どうくつ… 出現テーブルの method が cave
 * 「2ばんどうろ きた」は出現テーブルを持たないが、建物も無いので どうろ になる
 * ―― 名前や出現テーブルの有無で決めていたときは、ここが まち に化けていた。
 */
function kindOf(map) {
  if (map.region === "hub") return interiorOf.has(map.id) ? "hubIn" : "hub";
  if (interiorOf.has(map.id)) {
    return map.objects.some((o) => o.kind.type === "trainer") ? "gym" : "inside";
  }
  if (tablesOf(map).some((t) => t.method === "cave")) return "cave";
  return insideOf.has(map.id) ? "town" : "route";
}

const KIND = {
  town: { label: "まち", color: "#c94f46" },
  route: { label: "どうろ", color: "#4f9b46" },
  cave: { label: "どうくつ", color: "#7b736b" },
  gym: { label: "ジム", color: "#b8862b" },
  inside: { label: "たてもの", color: "#3f6fa8" },
  hub: { label: "きょてん", color: "#8a6fb0" },
  hubIn: { label: "きょてんの中", color: "#8a6fb0" },
};

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ─────────────────────────────────────────────
// 世界の骨格（建物を畳んだ図）
// ─────────────────────────────────────────────
const outdoor = maps.filter((m) => !interiorOf.has(m.id));
const nodeName = (id) => id.replace(/[^a-zA-Z0-9]/g, "_");

const edges = new Map();
for (const map of outdoor) {
  for (const warp of map.warps) {
    const to = interiorOf.get(warp.to.map) ?? warp.to.map;
    if (to === map.id) continue;
    // 双方向は1本にまとめる。**同じ道を2本引くと図が読めなくなる**
    const key = [map.id, to].sort().join("|");
    const found = edges.get(key) ?? { a: [map.id, to].sort()[0], b: [map.id, to].sort()[1], both: false, seen: new Set() };
    found.seen.add(`${map.id}>${to}`);
    found.both = found.seen.size > 1;
    edges.set(key, found);
  }
}

const skeleton = [
  "flowchart TD",
  ...outdoor
    .slice()
    .sort((a, b) => depth.get(a.id) - depth.get(b.id))
    .map((m) => `  ${nodeName(m.id)}["${m.name}"]:::${kindOf(m)}`),
  ...[...edges.values()].map((e) => `  ${nodeName(e.a)} ${e.both ? "---" : "-->"} ${nodeName(e.b)}`),
  ...gates.map((g) =>
    g.to === null
      ? `  ${nodeName(g.from)} -. じゅんびちゅう .-> not_ready_${nodeName(g.event)}(["まだ 入れない"]):::hub`
      : `  ${nodeName(g.from)} -. ゲート .-> ${nodeName(g.to)}`,
  ),
  ...Object.entries(KIND).map(
    ([id, k]) => `  classDef ${id} fill:${k.color}22,stroke:${k.color},stroke-width:2px`,
  ),
].join("\n");

// ─────────────────────────────────────────────
// 町ごとの中身
// ─────────────────────────────────────────────
const doorsInto = (parentId, childId) => {
  const parent = byId.get(parentId);
  return parent.warps
    .filter((w) => w.to.map === childId)
    .map((w) => `${w.at.x},${w.at.y}`)
    .join(" / ");
};

const townCards = [...insideOf.entries()]
  .sort((a, b) => depth.get(a[0]) - depth.get(b[0]))
  .map(([parentId, children]) => {
    const parent = byId.get(parentId);
    const rows = children
      .sort((a, b) => a.localeCompare(b))
      .map((childId) => {
        const child = byId.get(childId);
        const kind = KIND[kindOf(child)];
        return `        <tr>
          <td><span class="dot" style="background:${kind.color}"></span>${escape(child.name)}</td>
          <td class="mono">${escape(childId)}</td>
          <td class="mono num">${escape(doorsInto(parentId, childId))}</td>
        </tr>`;
      })
      .join("\n");
    return `    <article class="town">
      <h3>${escape(parent.name)} <span class="mono id">${escape(parentId)}</span></h3>
      <div class="scroll"><table>
        <thead><tr><th>なかみ</th><th>マップ ID</th><th>入口（親側の座標）</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table></div>
    </article>`;
  })
  .join("\n");

// ─────────────────────────────────────────────
// 全マップ表
// ─────────────────────────────────────────────
const allRows = maps
  .slice()
  .sort((a, b) => depth.get(a.id) - depth.get(b.id) || a.id.localeCompare(b.id))
  .map((map) => {
    const kind = KIND[kindOf(map)];
    const tr = map.objects.filter((o) => o.kind.type === "trainer");
    const enc = tablesOf(map);
    const encLabel =
      enc.length === 0 ? "—" : enc.map((t) => `${t.entries.length}種 / ${t.method}`).join(" ・ ");
    const names = tr
      .map((o) => trainerById.get(o.kind.trainer)?.name ?? o.kind.trainer)
      .join("・");
    return `      <tr>
        <td class="num mono">${depth.get(map.id) === 99 ? "—" : depth.get(map.id)}</td>
        <td><span class="dot" style="background:${kind.color}"></span>${escape(map.name)}<br /><span class="mono id">${escape(map.id)}</span></td>
        <td class="mono">${kind.label}</td>
        <td class="num mono">${map.size.width}×${map.size.height}</td>
        <td class="mono">${escape(encLabel)}</td>
        <td class="num mono">${map.warps.length}</td>
        <td>${tr.length === 0 ? "—" : `<span class="mono num">${tr.length}</span> ${escape(names)}`}</td>
      </tr>`;
  })
  .join("\n");

const counts = {
  maps: maps.length,
  kanto: maps.filter((m) => m.region === "kanto").length,
  outdoor: outdoor.length,
  inside: interiorOf.size,
  warps: maps.reduce((n, m) => n + m.warps.length, 0),
  trainers: maps.reduce((n, m) => n + m.objects.filter((o) => o.kind.type === "trainer").length, 0),
};

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

const html = `<title>カントーのつながり</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
/>
<style>
  /* 地の色は世界の草の色に寄せた紙。無彩色の灰にしない */
  :root {
    color-scheme: light;
    --ground: #eef0ea;
    --panel: #ffffff;
    --sunk: #e4e7dd;
    --ink: #22261f;
    --dim: #626a5c;
    --faint: #8b9382;
    --line: #d4d8cc;
    --accent: #4f9b46;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --ground: #171a15;
      --panel: #1e221b;
      --sunk: #12140f;
      --ink: #e6e9df;
      --dim: #a2ab97;
      --faint: #79806e;
      --line: #333829;
      --accent: #79c46e;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ground: #171a15;
    --panel: #1e221b;
    --sunk: #12140f;
    --ink: #e6e9df;
    --dim: #a2ab97;
    --faint: #79806e;
    --line: #333829;
    --accent: #79c46e;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    padding: 0 0 4rem;
    background: var(--ground);
    color: var(--ink);
    font-family: "Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    line-height: 1.75;
    -webkit-text-size-adjust: 100%;
  }

  header { border-bottom: 1px solid var(--line); background: var(--panel); }
  .bar { max-width: 880px; margin: 0 auto; padding: 1.2rem 1rem 1rem; }
  h1 { margin: 0; font-size: 1.15rem; font-weight: 700; text-wrap: balance; }
  .meta {
    margin: .2rem 0 0;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: .68rem; letter-spacing: .06em; color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .counts { display: flex; flex-wrap: wrap; gap: .4rem 1.6rem; margin-top: .9rem; }
  .counts div { display: flex; align-items: baseline; gap: .4rem; }
  .counts b {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .counts span { font-size: .74rem; color: var(--dim); }

  main { max-width: 880px; margin: 0 auto; padding: 1.2rem 1rem 0; }

  .note {
    border-left: 3px solid var(--accent);
    padding-left: .9rem; margin: 0 0 1.6rem;
    font-size: .86rem; color: var(--dim); max-width: 62ch;
  }
  .note b { color: var(--ink); font-weight: 500; }
  .note p { margin: 0 0 .5rem; }
  .note p:last-child { margin-bottom: 0; }

  h2 {
    margin: 2.4rem 0 1rem;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: .7rem; font-weight: 600; letter-spacing: .16em; text-transform: uppercase;
    color: var(--faint);
    padding-bottom: .45rem; border-bottom: 1px solid var(--line);
  }
  h2:first-of-type { margin-top: 0; }

  .legend { display: flex; flex-wrap: wrap; gap: .3rem .9rem; margin: 0 0 1rem; padding: 0; list-style: none; }
  .legend li { display: flex; align-items: center; gap: .35rem; font-size: .78rem; color: var(--dim); }
  .dot { width: 10px; height: 10px; border-radius: 2px; flex: none; display: inline-block; margin-right: .4rem; }
  .legend .dot { margin-right: 0; }

  .diagram {
    background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
    padding: 1rem .5rem; overflow-x: auto;
  }
  .diagram pre { margin: 0; }

  .towns { display: grid; gap: 1.1rem; }
  .town h3 {
    margin: 0 0 .4rem; font-size: .95rem; font-weight: 700;
    display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem;
  }
  .id { font-size: .68rem; color: var(--faint); font-weight: 400; }

  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th {
    text-align: left; font-weight: 500; color: var(--faint);
    font-size: .68rem; letter-spacing: .06em; text-transform: uppercase;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    border-bottom: 1px solid var(--line); padding: .3rem .6rem .3rem 0; white-space: nowrap;
  }
  td { padding: .42rem .6rem .42rem 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .72rem; }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  footer {
    max-width: 880px; margin: 2.5rem auto 0; padding: 1rem;
    font-size: .76rem; color: var(--faint); border-top: 1px solid var(--line);
  }
  code { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: .74rem; }
</style>

<header>
  <div class="bar">
    <h1>カントーのつながり</h1>
    <p class="meta">GENERATED ${stamp} UTC / FROM packages/data/maps.json</p>
    <div class="counts">
      <div><b>${counts.maps}</b><span>マップ</span></div>
      <div><b>${counts.outdoor}</b><span>外（町・道路・洞窟・拠点）</span></div>
      <div><b>${counts.inside}</b><span>建物</span></div>
      <div><b>${counts.warps}</b><span>出入口</span></div>
      <div><b>${counts.trainers}</b><span>視線トレーナー</span></div>
    </div>
  </div>
</header>

<main>
  <div class="note">
    <p>
      <b>この図は手で描いていない。</b><code>packages/data/maps.json</code> から作っている
      ―― マップは v0.12 の1版で14枚増えたので、手描きの図はその日のうちに嘘になる。
    </p>
    <p>
      <b>「建物」は名前ではなく繋がり方で決めている。</b>
      出入口の行き先が1枚しかないマップを建物として畳んだ。
      名前で決めると、<code>-gym</code> を付け忘れた1枚が黙って外に混ざる。
    </p>
    <p>
      <b>拠点へのゲートだけは出入口ではない</b>（点線）。
      地方をまたぐのは warp ではなくイベントで、手持ちも進行も入れ替わる（v0.10）。
    </p>
  </div>

  <h2>World skeleton</h2>
  <ul class="legend">
${Object.entries(KIND)
  .filter(([id]) => id !== "hubIn")
  .map(([, k]) => `    <li><span class="dot" style="background:${k.color}"></span>${k.label}</li>`)
  .join("\n")}
  </ul>
  <div class="diagram">
<pre class="mermaid">
${skeleton}
</pre>
  </div>

  <h2>Towns and buildings</h2>
  <div class="towns">
${townCards}
  </div>

  <h2>Every map</h2>
  <p class="note">
    並びは<b>入口（${escape(kanto.start.map)}）からの遠さ</b>。
    出入口を何回くぐるかで数えている ―― 歩数ではないので、道路の長さは反映されない。
  </p>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>遠さ</th><th>マップ</th><th>種類</th><th>大きさ</th>
          <th>野生</th><th>出入口</th><th>トレーナー</th>
        </tr>
      </thead>
      <tbody>
${allRows}
      </tbody>
    </table>
  </div>
</main>

<footer>
  <code>npm run mapgraph</code> で作り直せる。マップを足したら、この資料も自動で追いつく。
</footer>
`;

mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true });
writeFileSync(OUT, html, "utf8");
console.log(`  マップ ${counts.maps}枚・出入口 ${counts.warps}か所 を 1枚にまとめました: ${OUT}`);
