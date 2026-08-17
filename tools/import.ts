/**
 * 一括投入: TSV（人が編集する中間形式） → JSON（ゲームが読む形式）
 *
 *   npx vite-node tools/import.ts
 *
 * 数千件を手で JSON に書くのは現実的でないため、編集しやすい TSV を正とし、
 * ここで変換する。設計: docs/design/data-schema.md §8
 *
 * 種族の行は種族値合計(BST)を冗長に持ち、各能力の合計と一致するかを検証する。
 * 数字の打ち間違い・桁の入れ替わりは、この照合でほぼ捕まる。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "packages/data/source");
const OUT = resolve(ROOT, "packages/data");

const errors: string[] = [];
const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

function readTsv(file: string): Record<string, string>[] {
  const text = readFileSync(resolve(SRC, file), "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
  const header = lines[0]!.split("\t").map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = line.split("\t");
    if (cells.length !== header.length) {
      err(`${file}:${i + 2}`, `列数が ${cells.length}（見出しは ${header.length}）`);
    }
    return Object.fromEntries(header.map((h, j) => [h, (cells[j] ?? "").trim()]));
  });
}

// ─────────────────────────────────────────────
// 技
// ─────────────────────────────────────────────

/**
 * 効果の記法: kind:引数:引数
 *   status:burn:0.1          → 10% でやけど
 *   statChange:foe:atk:-1:1  → 100% で相手の攻撃 -1
 *   drain:0.5 / recoil:0.25 / heal:0.5
 *   confuse:0.1 / flinch:0.3 / multiHit:2:5
 */
function parseEffect(src: string, where: string): unknown {
  if (src === "") return undefined;
  const [kind, ...args] = src.split(":");
  const num = (i: number) => Number(args[i]);

  switch (kind) {
    case "status":
      return { kind, status: args[0], chance: num(1) };
    case "confuse":
    case "flinch":
      return { kind, chance: num(0) };
    case "drain":
    case "recoil":
    case "heal":
      return { kind, ratio: num(0) };
    case "multiHit":
      return { kind, min: num(0), max: num(1) };
    case "statChange":
      return { kind, target: args[0], stat: args[1], stages: num(2), chance: num(3) };
    default:
      err(where, `未知の効果 "${kind}"`);
      return undefined;
  }
}

type MoveOut = {
  id: string; name: string; type: string; category: string;
  power: number | null; accuracy: number | null; pp: number; priority: number;
  target: string; critStage?: number; effect?: unknown;
};

function importMoves(): MoveOut[] {
  const rows = readTsv("moves.tsv");
  return rows.map((r) => {
    const where = `moves.tsv/${r["id"]}`;
    const move: MoveOut = {
      id: r["id"]!,
      name: r["name"]!,
      type: r["type"]!,
      category: r["category"]!,
      power: r["power"] === "-" ? null : Number(r["power"]),
      accuracy: r["accuracy"] === "-" ? null : Number(r["accuracy"]),
      pp: Number(r["pp"]),
      priority: Number(r["priority"] ?? 0),
      target: r["target"] || "foe",
    };
    const crit = Number(r["crit"] ?? 0);
    if (crit > 0) move.critStage = crit;
    const effect = parseEffect(r["effect"] ?? "", where);
    if (effect !== undefined) move.effect = effect;
    return move;
  });
}

// ─────────────────────────────────────────────
// 種族
// ─────────────────────────────────────────────

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

type SpeciesOut = {
  id: string; dexNo: number; name: string; types: string[];
  baseStats: Record<string, number>;
  abilities: string[];
  learnset: { level: number; move: string }[];
  catchRate: number; expType: string;
  evYield: Record<string, number>;
  genderRatio: number | null;
  learnsetSource: "provisional" | "official";
};

/**
 * 暫定 learnset の生成。
 *
 * 原作の習得レベルは持っていないため、規則で組み立てる。
 *   Lv1  … タイプ一致の低威力技（無ければ たいあたり）
 *   Lv7  … 補助技（あれば）
 *   Lv13 … タイプ一致の中威力技
 *   Lv22 … 汎用の中威力技
 *   Lv31 … タイプ一致の高威力技
 *
 * 生成物には learnsetSource: "provisional" を立て、
 * 検証スクリプトが「原作の値ではない」と報告できるようにする。
 */
function provisionalLearnset(
  types: string[],
  moves: MoveOut[],
  baseStats: Record<string, number>,
): { level: number; move: string }[] {
  // 得意な攻撃側（こうげき or とくこう）に合う分類を優先する。
  // これをしないと、とくこうが倍あるバタフリーが物理技だけ覚える、
  // といった噛み合わない構成になる。
  const preferred = (baseStats["atk"] ?? 0) >= (baseStats["spa"] ?? 0) ? "physical" : "special";

  const byType = (t: string, cat: "dmg" | "status", lo: number, hi: number) =>
    moves
      .filter((m) =>
        m.type === t &&
        (cat === "status" ? m.category === "status" : m.power !== null) &&
        (m.power === null || (m.power >= lo && m.power <= hi)))
      .sort((a, b) => Number(b.category === preferred) - Number(a.category === preferred));

  const pick = (list: MoveOut[]) => list[0]?.id;
  const out: { level: number; move: string }[] = [];
  const used = new Set<string>();
  const add = (level: number, id: string | undefined) => {
    if (id === undefined || used.has(id)) return;
    used.add(id);
    out.push({ level, move: id });
  };

  const [t1, t2] = types;

  add(1, pick(byType(t1!, "dmg", 1, 45)) ?? "tackle");
  add(7, pick(byType(t2 ?? t1!, "status", 0, 0)) ?? pick(byType(t1!, "status", 0, 0)));
  add(13, pick(byType(t1!, "dmg", 46, 70)));
  add(22, pick(byType(t2 ?? t1!, "dmg", 46, 70)) ?? "take-down");
  add(31, pick(byType(t1!, "dmg", 71, 130)));

  // 何も付かなかった場合の保険（検証 battle-ready を必ず通す）
  if (out.length === 0) out.push({ level: 1, move: "tackle" });
  if (!out.some((l) => l.level <= 5)) out.unshift({ level: 1, move: "tackle" });

  // ── 攻撃技のタイプを必ず2種類以上にする ──
  // 単タイプの種族は攻撃技が1タイプに偏り、そのタイプを無効化する相手に
  // 手も足も出なくなる（例: ノーマル単はゴーストに何もできない）。
  // 暫定 learnset である以上、少なくとも詰まない構成にしておく。
  const damagingTypes = new Set(
    out.map((l) => moves.find((m) => m.id === l.move)!).filter((m) => m.power !== null)
      .map((m) => m.type),
  );
  if (damagingTypes.size < 2) {
    const physical = (baseStats["atk"] ?? 0) >= (baseStats["spa"] ?? 0);
    const coverage = damagingTypes.has("normal")
      ? physical ? "rock-throw" : "confusion" // ノーマル単の補完
      : "body-slam"; // それ以外はノーマル技で補う
    add(18, coverage);
  }

  return out.sort((a, b) => a.level - b.level);
}

function importSpecies(moves: MoveOut[]): SpeciesOut[] {
  const rows = readTsv("species.tsv");
  return rows.map((r) => {
    const where = `species.tsv/${r["id"]}`;

    const baseStats: Record<string, number> = {};
    for (const k of STAT_KEYS) baseStats[k] = Number(r[k]);

    // ── チェックサム: 各能力の合計が BST 列と一致するか ──
    const sum = STAT_KEYS.reduce((n, k) => n + baseStats[k]!, 0);
    const bst = Number(r["bst"]);
    if (sum !== bst) {
      err(where, `種族値の合計が ${sum}、BST列は ${bst}（どちらかが誤り）`);
    }

    const types = [r["type1"]!, r["type2"] ?? ""].filter((t) => t !== "" && t !== "-");

    const evYield: Record<string, number> = {};
    for (const part of (r["ev"] ?? "").split(",").filter(Boolean)) {
      const [stat, n] = part.split(":");
      evYield[stat!] = Number(n);
    }

    const genderRaw = r["gender"] ?? "";
    return {
      id: r["id"]!,
      dexNo: Number(r["dex"]),
      name: r["name"]!,
      types,
      baseStats,
      abilities: (r["abilities"] ?? "").split(",").filter(Boolean),
      learnset: provisionalLearnset(types, moves, baseStats),
      catchRate: Number(r["catch"]),
      expType: r["exp"]!,
      evYield,
      genderRatio: genderRaw === "-" ? null : Number(genderRaw),
      learnsetSource: "provisional",
    };
  });
}

// ─────────────────────────────────────────────
function main(): void {
  const moves = importMoves();
  const species = importSpecies(moves);

  if (errors.length > 0) {
    console.error("投入を中止しました:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  writeFileSync(resolve(OUT, "moves.json"), JSON.stringify(moves, null, 2) + "\n");
  writeFileSync(resolve(OUT, "species.json"), JSON.stringify(species, null, 2) + "\n");

  console.log(`投入完了: 種族 ${species.length} / 技 ${moves.length}`);
  console.log(`  種族値のチェックサム ${species.length} 件すべて一致`);
  console.log(`  learnset は全件が暫定（原作の習得レベルではない）`);
}

main();
