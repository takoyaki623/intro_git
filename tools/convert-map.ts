/**
 * マップソース → MapData JSON。
 *
 * 設計（world.md §2）では Tiled の *.tmx を原本にすると決めていた。
 * **v0.7 ではテキストのマップソースを原本にする。** 判断の記録は world.md §2.1。
 * どちらにせよゲームが読むのは自作スキーマの JSON だけなので、
 * 原本の側を差し替えても影響はこのファイルの中で閉じる。
 *
 *   npx vite-node tools/convert-map.ts
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIRECTIONS, FIELD_ABILITIES, TERRAINS } from "@pkmn/core";
import type {
  Condition,
  Direction,
  FieldAbilityId,
  MapData,
  MapObject,
  MapObjectKind,
  TerrainId,
  Warp,
} from "@pkmn/core";

const SOURCE_DIR = "packages/data/source/maps";
const OUT = "packages/data/maps.json";

/** 見出し行で区切られたセクション。 */
type Sections = Record<string, string[]>;
const SECTIONS = ["legend", "grid", "warps", "objects"] as const;

class SourceError extends Error {
  constructor(file: string, line: number, message: string) {
    super(`${file}:${line} ${message}`);
  }
}

function splitSections(file: string, text: string): { head: Map<string, string>; body: Sections } {
  const head = new Map<string, string>();
  const body: Sections = Object.fromEntries(SECTIONS.map((s) => [s, [] as string[]]));
  let current: string | null = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    // grid はインデントも意味を持つので、行末だけ削る
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;

    const section = /^(\w+):\s*$/.exec(line.trim());
    if (section !== null && (SECTIONS as readonly string[]).includes(section[1]!)) {
      current = section[1]!;
      return;
    }
    if (current === null) {
      const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (kv === null) throw new SourceError(file, i + 1, `見出しでも "key: value" でもない`);
      head.set(kv[1]!, kv[2]!);
      return;
    }
    body[current]!.push(line);
  });
  return { head, body };
}

/** 凡例。`!` 前置で通行不可。 */
type LegendEntry = { terrain: TerrainId; blocked: boolean };

function parseLegend(file: string, lines: string[]): Map<string, LegendEntry> {
  const legend = new Map<string, LegendEntry>();
  for (const line of lines) {
    // 「文字 空白 定義」。文字自体が空白でないことは前提にできる
    const m = /^\s*(\S)\s+(!?)(\S+)/.exec(line);
    if (m === null) throw new SourceError(file, 0, `凡例の書式が違う: ${line}`);
    const [, char, bang, terrain] = m;
    if (!(TERRAINS as readonly string[]).includes(terrain!)) {
      throw new Error(`${file}: 未知の地形 "${terrain}"`);
    }
    if (legend.has(char!)) throw new Error(`${file}: 凡例の重複 "${char}"`);
    legend.set(char!, { terrain: terrain as TerrainId, blocked: bang === "!" });
  }
  return legend;
}

function parseCoords(file: string, token: string): { x: number; y: number } {
  const m = /^(\d+),(\d+)$/.exec(token);
  if (m === null) throw new Error(`${file}: 座標の書式が違う: "${token}"`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

function parseDirection(file: string, token: string): Direction {
  if (!(DIRECTIONS as readonly string[]).includes(token)) {
    throw new Error(`${file}: 未知の向き "${token}"`);
  }
  return token as Direction;
}

function parseWarps(file: string, lines: string[]): Warp[] {
  return lines.map((line) => {
    // "3,5 interact kanto-oak-lab 4,7 up"
    const t = line.trim().split(/\s+/);
    if (t.length !== 5) throw new Error(`${file}: warp は5項目: "${line}"`);
    const trigger = t[1]!;
    if (trigger !== "step" && trigger !== "interact") {
      throw new Error(`${file}: 未知の warp trigger "${trigger}"`);
    }
    return {
      at: parseCoords(file, t[0]!),
      trigger,
      to: { map: t[2]!, ...parseCoords(file, t[3]!), facing: parseDirection(file, t[4]!) },
    };
  });
}

function parseAbility(file: string, ability: string | undefined): FieldAbilityId {
  if (ability === undefined || !(FIELD_ABILITIES as readonly string[]).includes(ability)) {
    throw new Error(`${file}: 未知のフィールド技 "${ability}"`);
  }
  return ability as FieldAbilityId;
}

function parseKind(file: string, spec: string): MapObjectKind {
  const [type, ...rest] = spec.split(":");
  switch (type) {
    case "sign":
      return { type: "sign" };
    case "npc":
      return { type: "npc", sprite: rest[0] ?? "generic", movement: (rest[1] ?? "static") as "static" };
    case "trainer":
      return {
        type: "trainer",
        trainer: rest[0]!,
        sight: Number(rest[1] ?? 0),
        direction: parseDirection(file, rest[2] ?? "down"),
      };
    case "item":
      return { type: "item", item: rest[0]!, hidden: rest[1] === "hidden" };
    case "obstacle": {
      return { type: "obstacle", clearedBy: parseAbility(file, rest[0]) };
    }
    // 押せる岩とスイッチ（v1.1-f）。**文法は obstacle と同じ形**にしてある ――
    // 岩は「能力で対処する障害」という同じ読み方で書ける
    case "boulder": {
      return { type: "boulder", pushedBy: parseAbility(file, rest[0]) };
    }
    case "switch":
      return { type: "switch" };
    default:
      throw new Error(`${file}: 未知のオブジェクト種別 "${type}"`);
  }
}

/**
 * 条件。v0.7 の原本はフラグ条件しか書けない。
 * `Condition` 自体はもっと表現できるが、**書ける形を絞っておく**
 * ―― 原本の文法を広げるのは、必要になったマップが現れてからで足りる。
 */
function parseCondition(file: string, spec: string): Condition {
  const m = /^([\w.-]+)=(true|false)$/.exec(spec);
  if (m === null) throw new Error(`${file}: 条件の書式が違う: "${spec}"`);
  return { kind: "flag", flag: m[1]!, value: m[2] === "true" };
}

function parseObjects(file: string, lines: string[]): MapObject[] {
  return lines.map((line) => {
    const t = line.trim().split(/\s+/);
    if (t.length < 3) throw new Error(`${file}: オブジェクトは3項目以上: "${line}"`);
    const object: MapObject = {
      id: t[0]!,
      at: parseCoords(file, t[1]!),
      kind: parseKind(file, t[2]!),
    };
    for (const extra of t.slice(3)) {
      if (extra.startsWith("if:")) object.condition = parseCondition(file, extra.slice(3));
      else object.event = extra;
    }
    return object;
  });
}

function convert(file: string, text: string): MapData {
  const { head, body } = splitSections(file, text);
  const legend = parseLegend(file, body.legend!);
  const grid = body.grid!;
  if (grid.length === 0) throw new Error(`${file}: grid が空`);

  const width = grid[0]!.length;
  const height = grid.length;
  const ground: string[] = [];
  const collision: boolean[] = [];
  const terrain: TerrainId[] = [];

  grid.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`${file}: ${y + 1}行目の幅が ${row.length}（1行目は ${width}）`);
    }
    for (const char of row) {
      const entry = legend.get(char);
      if (entry === undefined) throw new Error(`${file}: 凡例に無い文字 "${char}"`);
      // タイル画像がまだ無いので、凡例の文字をそのまま「タイルID」として出す。
      // Tiled から変換する版でも、ここに実タイルIDが入るだけで型は変わらない
      ground.push(char);
      collision.push(entry.blocked);
      terrain.push(entry.terrain);
    }
  });

  const required = (key: string): string => {
    const value = head.get(key);
    if (value === undefined || value === "") throw new Error(`${file}: "${key}:" が無い`);
    return value;
  };

  const map: MapData = {
    id: required("id"),
    name: required("name"),
    region: required("region"),
    size: { width, height },
    layers: { ground, decoration: [], overhead: [] },
    collision,
    terrain,
    warps: parseWarps(file, body.warps!),
    objects: parseObjects(file, body.objects!),
  };
  // 出現テーブルは空白区切りで複数書ける（草むら用と なみのり用など・v0.12-d）
  const encounters = head.get("encounters");
  if (encounters !== undefined && encounters.trim() !== "") {
    map.encounters = encounters.trim().split(/\s+/);
  }
  // "fly: 6,1 kanto.fly.pewter" ―― 着地点と「来たことがある」印
  const fly = head.get("fly");
  if (fly !== undefined && fly.trim() !== "") {
    const t = fly.trim().split(/\s+/);
    if (t.length !== 2) throw new Error(`${file}: fly は「座標 フラグ」の2項目: "${fly}"`);
    map.flyPoint = { ...parseCoords(file, t[0]!), flag: t[1]! };
  }
  const onEnter = head.get("onEnter");
  if (onEnter !== undefined && onEnter.trim() !== "") map.onEnter = onEnter.trim();
  // "rules: safari" ―― その場所だけの規則（v1.1-h）。中身は field-rules.json
  const rules = head.get("rules");
  if (rules !== undefined && rules.trim() !== "") map.rules = rules.trim();
  const bgm = head.get("bgm");
  if (bgm !== undefined && bgm !== "") map.bgm = bgm;
  return map;
}

function main(): void {
  const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".map")).sort();
  const maps = files.map((f) => convert(f, readFileSync(join(SOURCE_DIR, f), "utf8")));

  const seen = new Set<string>();
  for (const map of maps) {
    if (seen.has(map.id)) throw new Error(`マップIDの重複: "${map.id}"`);
    seen.add(map.id);
  }

  const out = `${JSON.stringify(maps, null, 2)}\n`;

  // --check: 原本と生成物がずれていたら失敗する（CI 用。gen-ids と同じ運用）
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {
      console.error(`${OUT} がありません: npm run maps を実行してください`);
      process.exit(1);
    }
    if (current !== out) {
      console.error(`${OUT} が古くなっています: npm run maps を実行してコミットしてください`);
      process.exit(1);
    }
    console.log("マップは最新です");
    return;
  }

  writeFileSync(OUT, out, "utf8");
  console.log(`${OUT} … ${maps.length} マップ`);
  for (const map of maps) {
    console.log(
      `  ${map.id.padEnd(24)} ${map.size.width}x${map.size.height}  ` +
        `warp ${map.warps.length} / obj ${map.objects.length}`,
    );
  }
}

main();
