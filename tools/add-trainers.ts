/**
 * 道中のトレーナーを足す（v1.1-i）。
 *
 * **カントー再現の最後の穴は「密度」だった。** 実測すると道路25本にトレーナーは
 * 合わせて13人（原作は1本あたり4〜8人）。足りないのは仕掛けでも種でもなく、人の数。
 *
 * 手で足すと1人あたり**5箇所**（trainers.tsv・parties・flags.json・events.json 2件・.map）に
 * 書くことになる。v1.1-i でイベントとフラグの宣言を `trainers.tsv` に寄せたので3箇所になり、
 * ここでその3箇所ぶんを1行の指定から作る。
 *
 *   npx vite-node tools/add-trainers.ts kanto-route-9 むしとりしょうねん 2
 *
 * **置く場所はこの道具が選ぶ。** 人が座標を決めると、
 *   - 通路の真ん中に立って**その先が通れなくなる**（v1.1-k でシルフ7階が実際にそうなった）
 *   - 視線が warp を睨んで、**出入口に入るたびに戦いになる**
 * のどちらかを必ずやる。空きマス・視線の通り・接続の維持を機械で確かめて選ぶ。
 *
 * 手持ちは**そのマップの出現表から**引く（v1.1-a の取り込みの再利用）。
 * 「その道に居るポケモンを連れている」のが道中のトレーナーの姿で、
 * こちらが種を選ぶと、道ごとの色がこちらの好みに寄る。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { canEnter, emptyWorldState, neighborsOf, walkableTerrains, FIELD_ABILITIES, terrainAt } from "@pkmn/core";
import type { MapData } from "@pkmn/core";

const DATA = "packages/data";
const MAPS = `${DATA}/maps.json`;
const SPECIES = `${DATA}/species.json`;
const ENCOUNTERS = `${DATA}/encounters.json`;
const TRAINERS = `${DATA}/source/trainers.tsv`;
const PARTIES = `${DATA}/source/trainer-parties.tsv`;

type Species = { id: string; name: string; learnset: { level: number; move: string }[] };
type Table = { id: string; method: string; entries: { species: string; levelRange: [number, number] }[] };

/** 職業ごとの台詞と名前。**2つずつ**あれば、同じ道に2人並んでも同じことを言わない。 */
const CLASSES: Record<string, { slug: string; names: string[]; before: string[]; after: string[]; prefer?: string[]; water?: true }> = {
  むしとりしょうねん: {
    slug: "bug",
    names: ["ススム", "ケンタ", "マサル", "テツオ", "ヒロシ"],
    before: ["むしポケモンは かっこいい!", "つかまえた むしを みせてやる!"],
    after: ["むしは よわくないんだ…", "もっと つかまえてくる!"],
    prefer: ["bug"],
  },
  ミニスカート: {
    slug: "lass",
    names: ["ミナミ", "サキ", "アヤ", "ユカ", "リカ"],
    before: ["かわいい ポケモン つれてる?", "しょうぶ しましょ!"],
    after: ["つよいのね。", "まいったわ…"],
  },
  たんぱんこぞう: {
    slug: "youngster",
    names: ["タカシ", "ゴロウ", "ケイタ", "ジロウ", "シュン"],
    before: ["ぼくの ポケモンは まけないぞ!", "はんズボンは うごきやすいんだ!"],
    after: ["つよいなあ…", "まけちゃった!"],
  },
  やまおとこ: {
    slug: "hiker",
    names: ["イワオ", "ゲンゾウ", "タケゾウ", "クマキチ"],
    before: ["やまを なめるなよ!", "いわの ポケモンは かたいぞ!"],
    after: ["やまは きびしいな…", "みごとだ!"],
    prefer: ["rock", "ground", "fighting"],
  },
  つりびと: {
    slug: "fisher",
    water: true,
    names: ["リョウ", "ウオゾウ", "カズヤ", "ハヤト"],
    before: ["つりの じゃまを するな!", "みずの ポケモンは つよいぞ!"],
    after: ["きょうは つれないな…", "まいった!"],
    prefer: ["water"],
  },
  かいパンやろう: {
    slug: "swimmer",
    water: true,
    names: ["ススム", "カイト", "マサヒロ", "タツヤ"],
    before: ["およぎには じしんが あるんだ!", "うみの ポケモンを みせてやる!"],
    after: ["うみは ひろいなあ…", "つよいな きみは!"],
    prefer: ["water"],
  },
  ぼうそうぞく: {
    slug: "biker",
    names: ["テツヤ", "リョウジ", "ゴウ", "ダイスケ"],
    before: ["どけどけーっ!", "この みちは おれたちの ものだ!"],
    after: ["ちっ…", "やるじゃねえか。"],
    prefer: ["poison"],
  },
  ギャンブラー: {
    slug: "gambler",
    names: ["トシオ", "マサオ", "ヒデキ"],
    before: ["かける ものは ポケモンさ!", "うんが いいのは どっちかな?"],
    after: ["ついてないな…", "はずれか…"],
  },
  エリートトレーナー: {
    slug: "ace",
    names: ["ヒロキ", "アキラ", "ユウジ", "ケンイチ", "ミサキ"],
    before: ["ほんきで いくぞ!", "うでを みせてもらう!"],
    after: ["まだまだ みたいだ…", "たいしたものだ。"],
  },
  ピクニックガール: {
    slug: "picnicker",
    names: ["ナオ", "エミ", "チカ", "マイ"],
    before: ["おべんとうの まえに しょうぶ!", "ピクニックの きねんに どう?"],
    after: ["おべんとうに しよう…", "つよいのね!"],
    prefer: ["grass", "normal"],
  },
  ジムトレーナー: {
    slug: "gymjr",
    names: ["ジロウ", "ケイコ", "タツキ", "ミドリ", "ハルキ", "サトミ"],
    before: ["リーダーの まえに ぼくが あいてだ!", "ジムの トレーナーを なめるなよ!"],
    after: ["リーダーは もっと つよいぞ。", "おくへ どうぞ…"],
  },
  かいじゅうマニア: {
    slug: "rocker",
    names: ["ジロウ", "ダイキ", "ノブオ"],
    before: ["いわの ポケモンは ロマンだ!", "かたい ポケモンが すきなんだ!"],
    after: ["ロマンだけじゃ かてないか…", "みごとだ!"],
    prefer: ["rock", "ground"],
  },
};

function main(): void {
  const [mapId, className, countText, levelText, speciesText] = process.argv.slice(2);
  const cls = CLASSES[className ?? ""];
  if (mapId === undefined || cls === undefined || countText === undefined) {
    console.error("使い方: add-trainers.ts <map> <職業> <人数> [レベル]");
    console.error(`職業: ${Object.keys(CLASSES).join(" / ")}`);
    process.exit(1);
  }
  const count = Number(countText);
  const maps = JSON.parse(readFileSync(MAPS, "utf8")) as MapData[];
  const map = maps.find((m) => m.id === mapId);
  if (map === undefined) throw new Error(`マップ "${mapId}" が無い`);

  const species = new Map(
    (JSON.parse(readFileSync(SPECIES, "utf8")) as Species[]).map((s) => [s.id, s]),
  );
  const tables = JSON.parse(readFileSync(ENCOUNTERS, "utf8")) as Table[];

  // ── 手持ちの候補は、そのマップに出る種 ──
  const here = tables.filter((t) => (map.encounters ?? []).includes(t.id));
  const wild =
    speciesText !== undefined && speciesText !== ""
      ? // **ジムや建物の中には出現表が無い。** そこだけは種を直接わたす ――
        // 「そのへんに居るポケモンを連れている」は道中のトレーナーの姿であって、
        // ジムトレーナーはリーダーと同じタイプで揃えるのが原作
        speciesText.split(",").map((id) => ({ species: id, level: Number(levelText ?? 10) }))
      : here.flatMap((t) => t.entries.map((e) => ({ species: e.species, level: e.levelRange[1] })));
  if (wild.length === 0) throw new Error(`${mapId}: 出現表が無いので手持ちを選べない（種を渡してください）`);
  const level = levelText !== undefined ? Number(levelText) : Math.max(...wild.map((w) => w.level)) + 2;

  // ── 立てる場所を選ぶ ──
  const world = { ...emptyWorldState(), abilities: [...FIELD_ABILITIES] };
  world.walkable = walkableTerrains(
    JSON.parse(readFileSync(`${DATA}/field-abilities.json`, "utf8")),
    [...FIELD_ABILITIES],
  );
  const taken = new Set(map.objects.map((o) => `${o.at.x},${o.at.y}`));
  const warps = new Set(map.warps.map((w) => `${w.at.x},${w.at.y}`));
  const { width, height } = map.size;
  const free = (x: number, y: number) =>
    canEnter(map, world, x, y, {}) && !taken.has(`${x},${y}`) && !warps.has(`${x},${y}`);

  /** マップの中を歩ける全マス（warp は辿らない）。 */
  const walkableTiles = () => {
    const all: string[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) if (canEnter(map, world, x, y, {})) all.push(`${x},${y}`);
    }
    return all;
  };
  const ALL = walkableTiles();

  /**
   * そこに立っても**マップが割れない**か（v1.1-i）。
   *
   * 隣の数で見ていたら、洞窟のような細い道ばかりのマップでは
   * **1人も置けない**（チャンピオンロードで実際に0箇所になった）。
   * かといって数を緩めると、通路の真ん中に立って向こう側を切り離す ――
   * v1.1-k でシルフ7階が実際にそうなっていた形。
   * **「割れるかどうか」を直接塗りつぶして見るのが正しい**（#55 と同じ見方）。
   */
  const reach = (blocked: ReadonlySet<string>) => {
    const open = ALL.filter((t) => !blocked.has(t));
    if (open.length === 0) return new Set<string>();
    const seen = new Set([open[0]!]);
    const stack = [open[0]!];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!.split(",").map(Number) as [number, number];
      for (const n of neighborsOf(map, world, cx, cy, { followWarps: false })) {
        const key = `${n.x},${n.y}`;
        if (seen.has(key) || blocked.has(key)) continue;
        seen.add(key);
        stack.push(key);
      }
    }
    return seen;
  };
  /**
   * **今より切り離されたマスが増えないか。**
   *
   * 「全部つながっているか」で見ると、**既に誰かが割っているマップでは1人も置けない**
   * ―― 見るべきは全体の完全さではなく、自分が置かれたことで減るかどうか。
   */
  const keepsWhole = (bx: number, by: number) => {
    const base = reach(new Set(taken));
    if (!base.has(`${bx},${by}`)) return false;
    return reach(new Set([...taken, `${bx},${by}`])).size === base.size - 1;
  };

  /**
   * **誰かの最後の1マスを奪わないか**（v1.1-i）。
   *
   * 話しかけるのは隣からなので、周り4マスを埋められた相手は
   * 置いてあるのに一生喋らない ―― 検証 #116 がまさにこれを拾った
   * （グレンジムで、カツラの前に立ってしまった）。
   * **道具が作った不具合を、道具のほうで塞ぐ。**
   */
  const keepsTalkable = (bx: number, by: number) => {
    for (const other of map.objects) {
      if (other.event === undefined) continue;
      if (other.kind.type === "item" || other.kind.type === "switch") continue;
      const ways = [
        { x: other.at.x + 1, y: other.at.y },
        { x: other.at.x - 1, y: other.at.y },
        { x: other.at.x, y: other.at.y + 1 },
        { x: other.at.x, y: other.at.y - 1 },
      ].filter(
        (n) =>
          canEnter(map, world, n.x, n.y, { ignoreConditional: true }) &&
          !taken.has(`${n.x},${n.y}`) &&
          !(n.x === bx && n.y === by),
      );
      if (ways.length === 0) return false;
    }
    return true;
  };

  /** そこに立って前を見たとき、視線が通り、出入口を睨まないか。 */
  const spotOk = (x: number, y: number, dx: number, dy: number, sight: number) => {
    if (!free(x, y)) return false;
    // **水の上に立てるのは およぐ人だけ**（つりびと・かいパンやろう）
    if (terrainAt(map, x, y) === "water" && cls.water !== true) return false;
    if (!keepsWhole(x, y)) return false;
    if (!keepsTalkable(x, y)) return false;
    for (let i = 1; i <= sight; i += 1) {
      const sx = x + dx * i;
      const sy = y + dy * i;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;
      if (!canEnter(map, world, sx, sy, {})) return false;
      if (warps.has(`${sx},${sy}`)) return false;
      // 陸の人は水の上を睨まない（近づけない相手になる）
      if (terrainAt(map, sx, sy) === "water" && cls.water !== true) return false;
    }
    return true;
  };

  const dirs = [
    { name: "down", dx: 0, dy: 1 },
    { name: "left", dx: -1, dy: 0 },
    { name: "up", dx: 0, dy: -1 },
    { name: "right", dx: 1, dy: 0 },
  ];
  // 置ける場所を**全部**集めてから、離れているものを選ぶ。
  // 端から順に取ると**道の隅に一列**に並び、置いた跡が見えてしまう
  const candidates: { x: number; y: number; dir: string; sight: number }[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const dir = dirs.find((d) => spotOk(x, y, d.dx, d.dy, 2));
      if (dir !== undefined) candidates.push({ x, y, dir: dir.name, sight: 2 });
    }
  }
  const spots: { x: number; y: number; dir: string; sight: number }[] = [];
  const far = (c: { x: number; y: number }) =>
    spots.length === 0
      ? Math.abs(c.x - width / 2) + Math.abs(c.y - height / 2)
      : Math.min(...spots.map((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y)));
  while (spots.length < count && candidates.length > 0) {
    // いちばん遠いものを選ぶ（同点なら先に見つけたほう）
    let best = 0;
    for (let i = 1; i < candidates.length; i += 1) {
      if (far(candidates[i]!) > far(candidates[best]!)) best = i;
    }
    const chosen = candidates.splice(best, 1)[0]!;
    if (spots.length > 0 && far(chosen) < 4) break;
    spots.push(chosen);
    taken.add(`${chosen.x},${chosen.y}`);
  }
  if (spots.length < count) {
    console.log(`  ⚠ ${mapId}: 置ける場所が ${spots.length} 箇所しか無い（${count} 人ぶん頼まれた）`);
  }

  // ── 行を作る ──
  const key = mapId.replace(/^kanto-/, "").replace(/-/g, "");
  const slug = cls.slug;
  const trainerRows: string[] = [];
  const partyRows: string[] = [];
  const objectLines: string[] = [];
  const used = new Set(
    readFileSync(TRAINERS, "utf8").split("\n").map((l) => l.split("\t")[0]),
  );

  spots.forEach((spot, i) => {
    let n = i + 1;
    let id = `${mapId}-${slug}-${n}`;
    while (used.has(id)) { n += 1; id = `${mapId}-${slug}-${n}`; }
    used.add(id);
    const flag = `kanto.${key}.${slug}${n}-beaten`;
    const name = cls.names[i % cls.names.length]!;
    const before = cls.before[i % cls.before.length]!;
    const after = cls.after[i % cls.after.length]!;
    const reward = level * 20;
    trainerRows.push([id, name, className, reward, flag, before, after].join("\t"));

    // 手持ち: そのマップに出る種から、職業の好みに合うものを優先して2体
    const liked = wild.filter((w) => {
      const s = species.get(w.species);
      if (s === undefined) return false;
      if (cls.prefer === undefined) return true;
      const types = (s as unknown as { types: string[] }).types;
      return cls.prefer.some((t) => types.includes(t));
    });
    const pool = liked.length > 0 ? liked : wild;
    const picks = [pool[(i * 2) % pool.length]!, pool[(i * 2 + 1) % pool.length]!];
    for (const [j, pick] of picks.entries()) {
      const s = species.get(pick.species)!;
      const lv = Math.max(2, level - j * 2);
      const moves = s.learnset
        .filter((l) => l.level <= lv)
        .slice(-4)
        .map((l) => l.move);
      const unique = [...new Set(moves)].slice(0, 4);
      if (unique.length === 0) continue;
      partyRows.push([id, s.id, lv, unique.join("/"), "-"].join("\t"));
    }
    objectLines.push(
      `${key}-${slug}-${n} ${spot.x},${spot.y} trainer:${id}:${spot.sight}:${spot.dir} ` +
        `kanto.${key}.${slug}${n} if:${flag}=false`,
    );
  });

  writeFileSync(TRAINERS, `${readFileSync(TRAINERS, "utf8").replace(/\n$/, "")}\n${trainerRows.join("\n")}\n`);
  writeFileSync(PARTIES, `${readFileSync(PARTIES, "utf8").replace(/\n$/, "")}\n${partyRows.join("\n")}\n`);

  // **原本（.map）にも書き込む。** 貼るのを人にやらせると、
  // 3箇所のうち1箇所だけ古いという状態が必ず生まれる
  const source = `${DATA}/source/maps/${mapId}.map`;
  const text = readFileSync(source, "utf8").replace(/\n$/, "");
  writeFileSync(source, `${text}\n${objectLines.join("\n")}\n`);

  console.log(`  ${mapId} に ${spots.length} 人（${className}・Lv${level}）`);
  for (const line of objectLines) console.log(`    ${line}`);
}

main();
