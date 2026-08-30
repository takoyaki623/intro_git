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
    // はねる。**書き忘れではなく「何も起きない」**（types.ts の `nothing`）
    case "nothing":
    // へんしん（v1.1-i）。引数を取らない ―― コピー元は「目の前の相手」で決まる
    case "transform":
    // テレポート（v1.1-i）。野生戦から抜ける
    case "fleeWild":
    // プレゼント（v1.1-k）。威力の抽選は core（`resolvePresent`）が持つ
    case "present":
      return { kind };
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
    // 天気（v1.2-c）。**場に1つで、どちら側のものでもない**ので target を取らない
    case "weather":
      return { kind, weather: args[0], turns: num(1) };
    // 壁（v1.2-c）。張るのは使った側なので、こちらも target を取らない
    case "screen":
      return { kind, screen: args[0], turns: num(1) };
    // 溜め技（v1.2-c）。印は並び順ではなく名前で書く ――
    // charge:hidden:sun のどちらが欠けても読めるように
    case "charge": {
      const out: { kind: string; hidden?: boolean; sunSkips?: boolean } = { kind };
      if (args.includes("hidden")) out.hidden = true;
      if (args.includes("sun")) out.sunSkips = true;
      return out;
    }
    // 撃ったあとの休み・いちゃもん・メロメロ・まもる（v1.2-c）。引数を取らない
    case "recharge":
    case "torment":
    case "attract":
    case "protect":
      return { kind };
    // ちょうはつ（v1.2-c）
    case "taunt":
      return { kind, turns: num(0) };
    default:
      err(where, `未知の効果 "${kind}"`);
      return undefined;
  }
}

type MoveOut = {
  id: string; name: string; type: string; category: string;
  power: number | null; accuracy: number | null; pp: number; priority: number;
  target: string; critStage?: number; contact?: boolean; effect?: unknown;
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
    if (r["contact"] === "1") move.contact = true;
    const effect = parseEffect(r["effect"] ?? "", where);
    if (effect !== undefined) move.effect = effect;
    return move;
  });
}

// ─────────────────────────────────────────────
// 特性・持ち物（v0.5）
// ─────────────────────────────────────────────

/**
 * 特性と持ち物は同じ効果の語彙（HeldEffect）を共有するため、パーサも1つ。
 *
 * 記法: kind:引数:引数
 *   pinchBoost:fire:1.5           → HP1/3以下でほのお技 1.5倍
 *   typeAbsorb:water:heal:1/4     → みず無効、最大HPの1/4回復
 *   contactStatus:poison/sleep:0.3 → 接触時 30% でどく か ねむり
 *   statDropImmunity:all          → 能力低下を全て無効
 *   inert:理由                    → バトル中は何もしない（理由を必ず書く）
 *
 * 割合は 1/16 のような分数で書ける。0.0625 と書くより意図が読める。
 */
function parseRatio(src: string | undefined, where: string): number {
  const text = (src ?? "").trim();
  const m = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(text);
  const value = m === null ? Number(text) : Number(m[1]) / Number(m[2]);
  if (!Number.isFinite(value)) err(where, `数値として読めない: "${text}"`);
  return value;
}

const list = (src: string | undefined): string[] =>
  (src ?? "").split("/").filter((s) => s !== "");

function parseHeldEffect(src: string, where: string): unknown {
  if (src === "") return undefined;
  const [kind, ...a] = src.split(":");
  const ratio = (i: number) => parseRatio(a[i], where);

  switch (kind) {
    case "pinchBoost":
    case "typeBoost":
      return { kind, moveType: a[0], ratio: ratio(1) };
    case "superEffectiveBoost":
      return { kind, ratio: ratio(0) };
    case "powerRecoil":
      return { kind, ratio: ratio(0), recoil: ratio(1) };
    case "typeResist":
      return { kind, moveTypes: list(a[0]), ratio: ratio(1) };
    case "statMultiplier": {
      const out: Record<string, unknown> = { kind, stat: a[0], ratio: ratio(1) };
      if (a[2] === "banStatus") out["banStatusMoves"] = true;
      return out;
    }
    case "choice":
      return { kind, stat: a[0], ratio: ratio(1) };
    case "statusAtkBoost":
    case "accuracyMultiplier":
      return { kind, ratio: ratio(0) };
    case "critStage":
      return { kind, stages: Number(a[0]) };
    case "noCrit":
    case "confusionImmunity":
    case "noFlinch":
    case "noRecoil":
    case "noSecondary":
    case "endure":
    case "berryCure":
    case "switchOutCure":
    case "synchronize":
    case "trace":
    case "pressure":
    case "earlyBird":
      return { kind };
    case "typeAbsorb": {
      const gain =
        a[1] === "none" ? { kind: "none" }
        : a[1] === "heal" ? { kind: "heal", ratio: parseRatio(a[2], where) }
        : a[1] === "stat" ? { kind: "stat", stat: a[2], stages: Number(a[3]) }
        : a[1] === "boostMoveType" ? { kind: "boostMoveType", ratio: parseRatio(a[2], where) }
        : (err(where, `未知の typeAbsorb の効果 "${a[1]}"`), { kind: "none" });
      return { kind, moveType: a[0], gain };
    }
    case "statusImmunity":
      return { kind, statuses: list(a[0]) };
    case "statDropImmunity":
      return { kind, stats: a[0] === "all" ? "all" : list(a[0]) };
    case "switchInStatChange":
      return { kind, target: a[0], stat: a[1], stages: Number(a[2]) };
    case "contactStatus":
      return { kind, statuses: list(a[0]), chance: ratio(1) };
    case "contactDamage":
    case "endOfTurnHeal":
      return { kind, ratio: ratio(0) };
    case "addFlinch":
    case "endOfTurnCure":
      return { kind, chance: ratio(0) };
    case "statusOnHolder":
      return { kind, status: a[0] };
    case "berryHeal":
      return { kind, ratio: ratio(0), threshold: ratio(1) };
    case "trapType":
      return { kind, trapped: a[0] };
    case "inert": {
      // 理由なしの inert を許すと「実装したつもりで何もしない特性」が静かに増える
      const reason = a.join(":");
      if (reason === "") err(where, "inert には理由を書くこと");
      return { kind, reason };
    }
    default:
      err(where, `未知の効果 "${kind}"`);
      return undefined;
  }
}

type AbilityOut = { id: string; name: string; effect: unknown };

function importAbilities(): AbilityOut[] {
  return readTsv("abilities.tsv").map((r) => {
    const where = `abilities.tsv/${r["id"]}`;
    const effect = parseHeldEffect(r["effect"] ?? "", where);
    if (effect === undefined) err(where, "効果が空（何もしないなら inert:理由 と書く）");
    return { id: r["id"]!, name: r["name"]!, effect };
  });
}

type ItemOut = {
  id: string; name: string; category: string;
  price?: number; bpPrice?: number; held?: unknown; use?: unknown; useScope?: string; consumable?: boolean;
};

function importItems(moves: MoveOut[]): ItemOut[] {
  return [...handWritten(), ...machines(moves)];
}

/**
 * わざマシン（v1.1-b）。
 *
 * 番号と技の対応は `fetch-machines.ts` が公式データから書く。
 * **道具の行は人が書かない** ―― 22本を手で並べると、いつか番号がずれる。
 * 技を1つ実装するたびに本数が増えるので、なおさら手では追えない。
 *
 * 名前に技名を入れているのは原作と違う。原作はバッグで「わざマシン26」としか
 * 出さず、説明文で技を見せる ―― こちらは説明文の欄が無いので、
 * **名前が唯一の手掛かり**になる。番号を先に置いて原作の並びは保つ。
 */
function machines(moves: MoveOut[]): ItemOut[] {
  let rows: Record<string, string>[];
  try {
    rows = readTsv("machines.tsv");
  } catch {
    return [];
  }
  const byId = new Map(moves.map((m) => [m.id, m]));
  const out: ItemOut[] = [];
  for (const r of rows) {
    if ((r["skip"] ?? "") !== "") continue;
    const where = `machines.tsv/${r["id"]}`;
    const move = byId.get(r["move"]!);
    if (move === undefined) {
      err(where, `技 "${r["move"]}" が moves.tsv に無い`);
      continue;
    }
    // **秘伝マシンは番号が 101〜108。** そのまま並べると「わざマシン101」になる
    const hidden = r["id"]!.startsWith("hm");
    const number = (hidden ? String(Number(r["number"]) - 100) : r["number"]!).padStart(2, "0");
    const item: ItemOut = {
      id: r["id"]!,
      name: `${hidden ? "ひでんマシン" : "わざマシン"}${number} ${move.name}`,
      category: "tm",
      use: { kind: "teachMove", move: move.id },
      // **バトル中には使えない。** 戦っている1体の技を差し替えても画面と噛み合わない
      useScope: "field",
    };
    // **秘伝マシンは減らない**（v1.2-a）。原作でも何度でも使える ――
    // ここは長らく無条件に `consumable: true` で、コメントに
    // 「こうしておけば検証 #64 を書き換えずに済む」と書いてあった。
    // **道具のほうを原作に合わせ、検証のほうを狭める**（#64）
    if (!hidden) item.consumable = true;
    // **値段は machines.tsv が持つ**（v1.1-i）。デパートで売る数本だけに付く ――
    // 「配られるマシン」と「買えるマシン」を分けるのは番号ではなく値段の有無
    if ((r["price"] ?? "") !== "") item.price = Number(r["price"]);
    out.push(item);
  }
  return out;
}

function handWritten(): ItemOut[] {
  return readTsv("items.tsv").map((r) => {
    const where = `items.tsv/${r["id"]}`;
    const item: ItemOut = { id: r["id"]!, name: r["name"]!, category: r["category"]! };
    if ((r["price"] ?? "") !== "") item.price = Number(r["price"]);
    if ((r["bp"] ?? "") !== "") item.bpPrice = Number(r["bp"]);
    const held = parseHeldEffect(r["effect"] ?? "", where);
    if (held !== undefined) item.held = held;
    const use = parseUseEffect(r["use"] ?? "", where);
    if (use !== undefined) {
      item.use = use;
      if ((r["scope"] ?? "") !== "") item.useScope = r["scope"]!;
    }
    if (r["consumable"] === "1") item.consumable = true;
    return item;
  });
}

/**
 * バッグから「つかう」効果（v0.9）。
 *
 * `held` と同じ書き方だが**別の欄**にする。同じ欄に混ぜると、
 * 「持たせると回復し続けるきずぐすり」のような無意味な組み合わせが書けてしまう。
 */
function parseUseEffect(src: string, where: string): unknown {
  if (src === "") return undefined;
  // `|` で区切ると合成（かいふくのくすり = 全回復 + 状態異常）
  if (src.includes("|")) {
    return { kind: "multi", of: src.split("|").map((each) => parseUseEffect(each, where)) };
  }
  const [kind, ...a] = src.split(":");

  switch (kind) {
    case "heal":
      return { kind, amount: Number(a[0]) };
    case "healRatio":
      return { kind, ratio: parseRatio(a[0], where) };
    case "cure":
      // 空欄は「全ての状態異常」
      return { kind, status: (a[0] ?? "") === "" ? [] : list(a[0]) };
    case "revive":
      return { kind, ratio: parseRatio(a[0], where) };
    case "pp":
      return { kind, amount: Number(a[0]), all: a[1] === "all" };
    // わざマシン（v1.1-b）。道具の行そのものは machines.tsv から作るが、
    // 手で書きたくなったときのためにここでも読めるようにしておく
    case "teachMove":
      return { kind, move: a[0] };
    case "evolveByItem":
      // `item`（進化の石）か `trade`（つながりのヒモ）。既定は石
      return { kind, via: (a[0] ?? "") === "trade" ? "trade" : "item" };
    default:
      errors.push(`${where}: 未知の use 効果 ${kind}`);
      return undefined;
  }
}

/**
 * ボールの捕獲補正。
 * `bonus` の種類だけがコードで、ボールそのものは行を足すだけで増える。
 */
type BallOut = { id: string; bonus: Record<string, unknown> };

function importBalls(): BallOut[] {
  return readTsv("balls.tsv").map((r) => {
    const where = `balls.tsv/${r["id"]}`;
    const kind = r["bonus"]!;
    const value = Number(r["value"]);
    const fallback = Number(r["fallback"]);
    const arg = r["arg"] ?? "";

    switch (kind) {
      case "flat":
        return { id: r["id"]!, bonus: { kind, value } };
      case "guaranteed":
        return { id: r["id"]!, bonus: { kind } };
      case "type":
        return { id: r["id"]!, bonus: { kind, types: arg.split(",").filter(Boolean), value, fallback } };
      case "turnAtMost":
      case "turnAtLeast":
        return { id: r["id"]!, bonus: { kind, turns: Number(arg), value, fallback } };
      case "terrain":
        return { id: r["id"]!, bonus: { kind, terrain: arg, value, fallback } };
      case "alreadyCaught":
        return { id: r["id"]!, bonus: { kind, value, fallback } };
      default:
        err(where, `未知のボール補正 "${kind}"`);
        return { id: r["id"]!, bonus: { kind: "flat", value: 1 } };
    }
  });
}

// ─────────────────────────────────────────────
// 種族
// ─────────────────────────────────────────────

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** 進化の枝。`kind` が未実装のものは進行側が無視する（v0.9 で道具が入る）。 */
type EvolutionOut = {
  to: string;
  kind: "level" | "levelFriendship" | "useItem" | "trade" | "other";
  level?: number;
  item?: string;
  note?: string;
};

type SpeciesOut = {
  id: string; dexNo: number; name: string; types: string[];
  baseStats: Record<string, number>;
  abilities: string[];
  learnset: { level: number; move: string }[];
  tmMoves: string[];
  catchRate: number; expType: string;
  evYield: Record<string, number>;
  genderRatio: number | null;
  evolutions: EvolutionOut[];
  baseExp: number;
  learnsetSource: "provisional" | "official";
  /** baseExp の出どころ。BST からの推定である限り "provisional"。 */
  baseExpSource: "provisional" | "official";
  /** 公式 learnset を採った世代。SV に居ない種は第8・第7世代から採る。 */
  learnsetGen?: number;
};

/**
 * 公式 learnset の読み込み（v0.8）。
 *
 * `tools/fetch-official.ts` が書き出した TSV を読む。
 * **ここでは外部データを取りに行かない** ―― ビルドを外部に依存させないため。
 * ファイルが無ければ v0.4 の暫定生成に落ちる（生成物に `provisional` が立つ）。
 */
/**
 * 種族の数値の事実（v0.9.5）。
 *
 * 捕獲率・成長曲線・努力値・性別比・与える経験値は**公式データが持ち主**で、
 * `tools/fetch-numbers.ts` が veekun のデータセットから書き出す。
 * `name` は突き合わせ専用 ―― species.tsv の表記が正しいかをここで確かめる。
 */
type SpeciesNumbers = {
  name: string;
  catchRate: number;
  expType: string;
  evYield: Record<string, number>;
  genderRatio: number | null;
  baseExp: number;
};

function speciesNumbers(): Map<string, SpeciesNumbers> {
  const out = new Map<string, SpeciesNumbers>();
  let rows: Record<string, string>[];
  try {
    rows = readTsv("species-numbers.tsv");
  } catch {
    // 未生成でも投入は止めない。足りないことは buildSpecies が種ごとに報告する
    return out;
  }
  for (const r of rows) {
    const ev: Record<string, number> = {};
    for (const part of (r["ev"] ?? "").split(",").filter(Boolean)) {
      const [stat, n] = part.split(":");
      ev[stat!] = Number(n);
    }
    const gender = r["gender"] ?? "";
    out.set(r["id"]!, {
      name: r["name"]!,
      catchRate: Number(r["catch"]),
      expType: r["exp"]!,
      evYield: ev,
      genderRatio: gender === "-" ? null : Number(gender),
      baseExp: Number(r["baseExp"]),
    });
  }
  return out;
}

type OfficialLearnset = {
  gen: number;
  learnset: { level: number; move: string }[];
  /** わざマシンで覚えられる技（v1.1-a）。fetch-official.ts が `'M'` を選って書く。 */
  tm: string[];
};

function officialLearnsets(): Map<string, OfficialLearnset> {
  const out = new Map<string, OfficialLearnset>();
  let rows: Record<string, string>[];
  try {
    rows = readTsv("learnsets.tsv");
  } catch {
    return out;
  }
  for (const r of rows) {
    const learnset = (r["learnset"] ?? "")
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const [level, move] = pair.split(":");
        return { level: Number(level), move: move! };
      })
      .sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));
    const tm = (r["tm"] ?? "").split(",").filter(Boolean).sort();
    out.set(r["species"]!, { gen: Number(r["gen"]), learnset, tm });
  }
  return out;
}

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

/** 進化表の読み込み。無ければ空（v0.7 以前のデータでも通る）。 */
function evolutionsBySpecies(): Map<string, EvolutionOut[]> {
  const out = new Map<string, EvolutionOut[]>();
  let rows: Record<string, string>[];
  try {
    rows = readTsv("evolutions.tsv");
  } catch {
    return out;
  }
  for (const r of rows) {
    const evo: EvolutionOut = { to: r["to"]!, kind: (r["kind"] || "level") as EvolutionOut["kind"] };
    if (r["level"]) evo.level = Number(r["level"]);
    if (r["item"]) evo.item = r["item"];
    if (r["condition"]) evo.note = r["condition"];
    const list = out.get(r["from"]!) ?? [];
    list.push(evo);
    out.set(r["from"]!, list);
  }
  return out;
}

/**
 * 与える経験値の基礎値。
 *
 * **暫定値。** 原作の値（フシギダネ64・ピカチュウ112 …）は151種ぶんの
 * 正確なデータが手元に無く、記憶で書くと learnset と同じ轍を踏む。
 * 進化段階ごとの係数を種族値合計に掛けて推定する。
 *
 * 未進化 0.20 は実測とよく合う（フシギダネ 318×0.2=64、キャタピー 195×0.2=39、
 * コイキング 200×0.2=40 はいずれも原作の値と一致する）。
 * 最終進化は誤差が大きい（リザードン等で ±15%）。
 *
 * **これが効くのはレベルの上がる速さだけ**で、バトルの正しさには影響しない。
 * 正確なデータが手に入ったら差し替える。
 */
function provisionalBaseExp(bst: number, stage: "basic" | "middle" | "final"): number {
  const ratio = { basic: 0.2, middle: 0.32, final: 0.45 }[stage];
  return Math.round(bst * ratio);
}

function importSpecies(moves: MoveOut[]): SpeciesOut[] {
  const all = buildSpecies(moves);

  // ── 公式値が無い種だけ、進化段階から baseExp を推定する ──
  // v0.9.5 で species-numbers.tsv が入り、151種は全件が実データになった。
  // 推定の道は**消さずに残す** ―― v0.11 で種を足したとき、数値の取り込みを
  // 忘れても遊べなくならないようにするため（忘れたことは検証が報告する）
  const needsGuess = all.filter((s) => s.baseExpSource === "provisional");
  if (needsGuess.length > 0) {
    const evolvesInto = new Set(all.flatMap((s) => s.evolutions.map((e) => e.to)));
    const evolvesFrom = new Set(all.filter((s) => s.evolutions.length > 0).map((s) => s.id));
    for (const s of needsGuess) {
      const isMiddle = evolvesInto.has(s.id) && evolvesFrom.has(s.id);
      const isFinal = evolvesInto.has(s.id) && !evolvesFrom.has(s.id);
      const bst = STAT_KEYS.reduce((n, k) => n + s.baseStats[k]!, 0);
      s.baseExp = provisionalBaseExp(bst, isMiddle ? "middle" : isFinal ? "final" : "basic");
    }
  }
  return all;
}

function buildSpecies(moves: MoveOut[]): SpeciesOut[] {
  const rows = readTsv("species.tsv");
  const official = officialLearnsets();
  const numbers = speciesNumbers();
  /** 公式の数値が無い種。止めずに集めて、最後にまとめて報告する。 */
  const missingNumbers: string[] = [];
  const evolutions = evolutionsBySpecies();
  const known = new Set(moves.map((m) => m.id));

  const built: SpeciesOut[] = rows.map((r) => {
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

    // ── 数値の事実は species-numbers.tsv（公式データ）が持ち主 ──
    //
    // **無くても止めない。** 出典の veekun データは第7世代（807種）までで、
    // 第8・第9世代の種は載っていない。そういう種は推定にフォールバックし、
    // 検証（#68）が「推定値である」と報告し続ける（fetch-numbers.ts の注記）
    const num = numbers.get(r["id"]!);
    if (num === undefined) missingNumbers.push(r["id"]!);
    // 名前は突き合わせるだけ。**species.tsv 側は人が読むための見出しとして残す**
    if (num !== undefined && num.name !== r["name"]) {
      err(where, `名前が公式データと違う: "${r["name"]}" / 公式 "${num.name}"`);
    }

    // ── learnset ──
    // 公式データがあればそれを使う。技の追加待ちで薄くなる種は暫定で埋めない
    // （「原作ではその技しか覚えない」という事実を潰さないため）
    const found = official.get(r["id"]!);
    for (const entry of found?.learnset ?? []) {
      if (!known.has(entry.move)) err(where, `learnsets.tsv の技 "${entry.move}" が moves.tsv に無い`);
    }
    const learnset = found?.learnset ?? provisionalLearnset(types, moves, baseStats);

    // ── わざマシン互換表 ──
    // **空になる理由は2つある**（公式データがまだ無い／原作でも0本）。
    // 見分けるのは `learnsetSource` の仕事なので、ここでは埋めない ――
    // キャタピー・ビードル・コクーン・メタモンは本当に0本で、
    // `fetch-official.ts` がその4件を名指しで報告する
    for (const move of found?.tm ?? []) {
      if (!known.has(move)) err(where, `learnsets.tsv の tm "${move}" が moves.tsv に無い`);
    }

    return {
      id: r["id"]!,
      dexNo: Number(r["dex"]),
      name: r["name"]!,
      types,
      baseStats,
      abilities: (r["abilities"] ?? "").split(",").filter(Boolean),
      learnset,
      tmMoves: found?.tm ?? [],
      evolutions: evolutions.get(r["id"]!) ?? [],
      baseExp: num?.baseExp ?? 0, // 無ければ進化段階から推定（importSpecies の第2周）
      catchRate: num?.catchRate ?? 255,
      expType: num?.expType ?? "medium-fast",
      evYield: num?.evYield ?? {},
      genderRatio: num?.genderRatio ?? null,
      learnsetSource: found === undefined ? "provisional" : "official",
      baseExpSource: num === undefined ? "provisional" : "official",
      ...(found === undefined ? {} : { learnsetGen: found.gen }),
    };
  });

  if (missingNumbers.length > 0) {
    console.warn(
      `  ⚠ 公式の数値が無い種が ${missingNumbers.length} 件（推定で埋めた）: ` +
        missingNumbers.slice(0, 8).join(" "),
    );
  }
  return built;
}

// ─────────────────────────────────────────────
// 施設の相手プール
// ─────────────────────────────────────────────

type BattleSetOut = {
  id: string; species: string; moves: string[]; item: string; ability: string;
  nature: string; evs: Record<string, number>; grade: number; tags: string[];
};

function importBattleSets(): BattleSetOut[] {
  return readTsv("battle-sets.tsv").map((r) => {
    const where = `battle-sets.tsv/${r["id"]}`;
    const evs: Record<string, number> = {};
    let total = 0;
    for (const part of (r["evs"] ?? "").split(",").filter(Boolean)) {
      const [stat, n] = part.split(":");
      const value = Number(n);
      if (value > 252) err(where, `努力値 ${stat} が 252 を超えている (${value})`);
      evs[stat!] = value;
      total += value;
    }
    if (total > 510) err(where, `努力値の合計が 510 を超えている (${total})`);

    const moves = (r["moves"] ?? "").split("/").filter(Boolean);
    if (moves.length === 0 || moves.length > 4) {
      err(where, `技が ${moves.length} 個（1〜4 個）`);
    }
    if (new Set(moves).size !== moves.length) err(where, "技が重複している");

    const grade = Number(r["grade"]);
    if (![1, 2, 3, 4].includes(grade)) err(where, `grade が 1〜4 の外 (${grade})`);

    return {
      id: r["id"]!,
      species: r["species"]!,
      moves,
      item: r["item"]!,
      ability: r["ability"]!,
      nature: r["nature"]!,
      evs,
      grade,
      tags: (r["tags"] ?? "").split("/").filter(Boolean),
    };
  });
}

// ─────────────────────────────────────────────
// ネームドキャラ（v0.6）
// ─────────────────────────────────────────────

type NamedOut = {
  id: string; name: string; role: string; region: string;
  concept: { type?: string; theme: string; tactic?: string };
  signature: string;
  tiers: Record<string, unknown[]>;
  dialogue: Record<string, unknown>;
};

/** 1体ぶんのパーティ行。ネストした JSON を人が書くのは現実的でないので行に開く。 */
function importNamedParties(): Map<string, Map<string, unknown[]>> {
  const out = new Map<string, Map<string, unknown[]>>();
  for (const r of readTsv("named-parties.tsv")) {
    const where = `named-parties.tsv/${r["character"]}/${r["species"]}`;
    const moves = (r["moves"] ?? "").split("/").filter(Boolean);
    if (moves.length === 0 || moves.length > 4) {
      err(where, `技が ${moves.length} 個（1〜4 個）`);
    }
    if (new Set(moves).size !== moves.length) err(where, "技が重複している");

    const member: Record<string, unknown> = {
      species: r["species"],
      level: Number(r["level"]),
      moves,
    };
    const optional = (key: string, field: string) => {
      const value = r[key] ?? "";
      if (value !== "" && value !== "-") member[field] = value;
    };
    optional("item", "item");
    optional("ability", "ability");
    optional("nature", "nature");

    const evsRaw = r["evs"] ?? "";
    if (evsRaw !== "" && evsRaw !== "-") {
      const evs: Record<string, number> = {};
      let total = 0;
      for (const part of evsRaw.split(",").filter(Boolean)) {
        const [stat, n] = part.split(":");
        const value = Number(n);
        if (value > 252) err(where, `努力値 ${stat} が 252 を超えている (${value})`);
        evs[stat!] = value;
        total += value;
      }
      if (total > 510) err(where, `努力値の合計が 510 を超えている (${total})`);
      member["evs"] = evs;
    }

    const character = r["character"]!;
    const tier = r["tier"]!;
    if (!out.has(character)) out.set(character, new Map());
    const tiers = out.get(character)!;
    if (!tiers.has(tier)) tiers.set(tier, []);
    tiers.get(tier)!.push(member);
  }
  return out;
}

/**
 * 本編のトレーナー（v1.1-a）。
 *
 * v1.0 まで `trainers.json` だけが**原本の無い主要データ**だった ――
 * 45人ぶんの入れ子 JSON を人が直接書いていた。約180人へ増やす前に器を直す。
 * 読み方はネームドと同じ（親の表＋1体1行の表）。
 */
/**
 * 道中のトレーナーのイベントを生成する（v1.1-i）。
 *
 * **同じ形の JSON を2件、人が書く必要はもう無い。**
 * 「話しかける → 勝つまで戦う → 勝ったら消える」は道中の全員に共通で、
 * 変わるのは**台詞2つだけ** ―― それを `trainers.tsv` の2列に置き、
 * 残り（条件・戦闘・フラグ立て・撃破後の受け答え）はここが組み立てる。
 *
 * 実測: 79人のうち **37人がこの形ちょうど**だった（v1.1-i で数えた）。
 * 残りはジムリーダー・ライバル・四天王など**台詞が2つでは足りない**面々で、
 * 台詞の列を空にしておくと生成しない ―― **「書かない」と「手で書く」を列で分ける。**
 *
 * 生成物は `events-trainers.json`。手で書くイベント（`events.json`）と
 * **混ぜない**のは、混ぜると次の生成でどちらが原本か分からなくなるから。
 */
function trainerEvents(trainers: readonly Record<string, unknown>[]): unknown[] {
  const out: unknown[] = [];
  for (const t of trainers) {
    const before = String(t["before"] ?? "");
    const after = String(t["after"] ?? "");
    if (before === "" || after === "") continue;
    const flag = String(t["defeatedFlag"]);
    const base = flag.replace(/-beaten$/, "");
    const speaker = String(t["class"]);
    const line = (text: string) => ({ kind: "message", text: text.replace(/\\n/g, "\n"), speaker });
    out.push({
      id: base,
      commands: [
        {
          kind: "if",
          cond: { kind: "flag", flag, value: false },
          then: [line(before), { kind: "battle", trainer: t["id"], onWin: `${base}-win` }],
          else: [line(after)],
        },
      ],
    });
    out.push({
      id: `${base}-win`,
      commands: [{ kind: "setFlag", flag, value: true }, line(after)],
    });
  }
  return out;
}

function importTrainers(): unknown[] {
  const parties = new Map<string, Record<string, unknown>[]>();
  for (const r of readTsv("trainer-parties.tsv")) {
    const where = `trainer-parties.tsv/${r["trainer"]}/${r["species"]}`;
    const moves = (r["moves"] ?? "").split("/").filter(Boolean);
    if (moves.length === 0 || moves.length > 4) err(where, `技が ${moves.length} 個（1〜4 個）`);
    if (new Set(moves).size !== moves.length) err(where, "技が重複している");

    const member: Record<string, unknown> = {
      species: r["species"],
      level: Number(r["level"]),
      moves,
    };
    const item = r["item"] ?? "";
    if (item !== "" && item !== "-") member["item"] = item;

    const trainer = r["trainer"]!;
    if (!parties.has(trainer)) parties.set(trainer, []);
    parties.get(trainer)!.push(member);
  }

  const seen = new Set<string>();
  const out = readTsv("trainers.tsv").map((r) => {
    const id = r["id"]!;
    const where = `trainers.tsv/${id}`;
    if (seen.has(id)) err(where, "ID が重複している");
    seen.add(id);
    const party = parties.get(id);
    // **手持ちが空のトレーナーを黙って作らない。** 戦いが始まった瞬間に終わる
    if (party === undefined || party.length === 0) err(where, "手持ちが1体も無い");
    if ((party?.length ?? 0) > 6) err(where, `手持ちが ${party!.length} 体（6体まで）`);
    return {
      id,
      name: r["name"]!,
      class: r["class"]!,
      reward: Number(r["reward"]),
      defeatedFlag: r["defeatedFlag"]!,
      party: party ?? [],
      // 台詞は JSON には出さない ―― イベントの材料としてだけ使う（下の `trainerEvents`）
      before: r["before"] ?? "",
      after: r["after"] ?? "",
    };
  });

  // 表にいないトレーナーの手持ちが残っていたら、消し忘れか綴り間違い
  for (const trainer of parties.keys()) {
    if (!seen.has(trainer)) {
      err("trainer-parties.tsv", `トレーナー "${trainer}" が trainers.tsv に無い`);
    }
  }
  return out;
}

function importNamed(): NamedOut[] {
  const parties = importNamedParties();
  return readTsv("named.tsv").map((r) => {
    const id = r["id"]!;
    const where = `named.tsv/${id}`;
    const tiers = parties.get(id);
    if (tiers === undefined) err(where, "パーティが1つも無い");

    const concept: NamedOut["concept"] = { theme: r["theme"]! };
    const type = r["type"] ?? "";
    if (type !== "" && type !== "-") concept.type = type;
    const tactic = r["tactic"] ?? "";
    if (tactic !== "" && tactic !== "-") concept.tactic = tactic;
    if (concept.theme === "") err(where, "theme が空（パーティより先に書く）");

    return {
      id,
      name: r["name"]!,
      role: r["role"]!,
      region: r["region"]!,
      concept,
      signature: r["signature"]!,
      tiers: Object.fromEntries(tiers ?? []),
      // 台詞は theme から機械的に組む。原作の文言は使わない（v0.10 で書き下ろす）
      dialogue: Object.fromEntries(
        [...(tiers?.keys() ?? [])].map((tier) => [
          tier,
          {
            before: `${r["name"]} 「${r["theme"]}」`,
            win: `${r["name"]} 「まだ こんなものでは ないぞ」`,
            lose: `${r["name"]} 「いい しょうぶ だった」`,
          },
        ]),
      ),
    };
  });
}

// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 姿のレシピ（v0.12.5）
//
// **体型と体色は公式の分類、飾りはこちらの判断**（`fetch-art.ts`）。
// 絵ではなく分類なので、このリポジトリに置ける（game-plan.md §10）。
// ─────────────────────────────────────────────

/** 描ける体型。ここに無い体型を書くと投入で止まる。 */
const SHAPES = [
  "ball", "squiggle", "fish", "arms", "blob", "upright", "legs",
  "quadruped", "wings", "tentacles", "heads", "humanoid", "bug-wings", "armor",
] as const;

/** 描ける飾り。 */
const PARTS = [
  "flame", "plant", "fin", "spark", "crystal", "drip", "aura",
  "horn", "spike", "plate", "antenna", "wing", "band", "sparkle",
] as const;

/** 公式の体色。 */
const COLORS = [
  "black", "blue", "brown", "gray", "green", "pink", "purple", "red", "white", "yellow",
] as const;

const SIZES = ["tiny", "small", "medium", "large"] as const;

type ArtOut = { species: string; shape: string; color: string; size: string; parts: string[] };

function importArt(): ArtOut[] {
  return readTsv("art.tsv").map((r) => {
    const where = `art.tsv/${r["species"]}`;
    const shape = r["shape"] ?? "";
    const color = r["color"] ?? "";
    if (!(SHAPES as readonly string[]).includes(shape)) err(where, `未知の体型 "${shape}"`);
    if (!(COLORS as readonly string[]).includes(color)) err(where, `未知の体色 "${color}"`);
    const size = r["size"] ?? "";
    if (!(SIZES as readonly string[]).includes(size)) err(where, `未知の大きさ "${size}"`);
    // **区切りはカンマ。** `list()` は別の区切りを使うので、ここは自前で割る
    const parts = (r["parts"] ?? "").split(",").map((p) => p.trim()).filter((p) => p !== "");
    for (const part of parts) {
      if (!(PARTS as readonly string[]).includes(part)) err(where, `未知の飾り "${part}"`);
    }
    return { species: r["species"]!, shape, color, size, parts };
  });
}

function main(): void {
  const moves = importMoves();
  const species = importSpecies(moves);
  const abilities = importAbilities();
  const items = importItems(moves);
  const balls = importBalls();
  const battleSets = importBattleSets();
  const named = importNamed();
  const trainers = importTrainers();
  const art = importArt();

  // **全種にレシピがあるか**をここで見る（検証 #87 と同じことを投入時にも）
  const drawn = new Set(art.map((a) => a.species));
  for (const s of species) {
    if (!drawn.has(s.id)) err("art.tsv", `種族 "${s.id}" のレシピが無い`);
  }

  if (errors.length > 0) {
    console.error("投入を中止しました:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }

  // --check: TSV を直して import を回し忘れていないか（CI 用・v1.1-a）
  //
  // v1.0 まで、生成物の鮮度を見ていたのはマップと ID 型だけだった。
  // **原本を直して import を忘れると、検証は古い JSON を見て通ってしまう。**
  // trainers.json が TSV に移ったことで、その穴が約180人ぶんに広がる
  const checking = process.argv.includes("--check");
  const stale: string[] = [];
  const write = (file: string, value: unknown) => {
    const text = JSON.stringify(value, null, 2) + "\n";
    const path = resolve(OUT, file);
    if (!checking) {
      writeFileSync(path, text);
      return;
    }
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      stale.push(`${file}（まだ無い）`);
      return;
    }
    if (current !== text) stale.push(file);
  };

  write("moves.json", moves);
  write("species.json", species);
  write("abilities.json", abilities);
  write("items.json", items);
  write("balls.json", balls);
  write("battle-sets.json", battleSets);
  write("named.json", named);
  write(
    "trainers.json",
    (trainers as Record<string, unknown>[]).map(({ before: _b, after: _a, ...rest }) => rest),
  );
  write("events-trainers.json", trainerEvents(trainers as Record<string, unknown>[]));
  write("art.json", art);

  const inert = abilities.filter(
    (a) => (a.effect as { kind?: string } | undefined)?.kind === "inert",
  ).length;

  if (checking) {
    if (stale.length > 0) {
      console.error(
        `生成物が古くなっています: npm run import を実行してコミットしてください（${stale.join(" / ")}）`,
      );
      process.exit(1);
    }
    console.log("投入された JSON は最新です（原本と一致）");
    return;
  }

  console.log(`投入完了: 種族 ${species.length} / 技 ${moves.length}`);
  console.log(`  種族値のチェックサム ${species.length} 件すべて一致`);
  const official = species.filter((s) => s.learnsetSource === "official");
  if (official.length === species.length) {
    const byGen = new Map<number, number>();
    for (const s of official) byGen.set(s.learnsetGen!, (byGen.get(s.learnsetGen!) ?? 0) + 1);
    console.log(
      `  learnset は全件が公式データ（${[...byGen].sort((a, b) => b[0] - a[0]).map(([g, n]) => `第${g}世代 ${n}種`).join(" / ")}）`,
    );
  } else {
    console.log(`  learnset: 公式 ${official.length} 種 / 暫定 ${species.length - official.length} 種`);
  }
  const tmTotal = species.reduce((n, s) => n + s.tmMoves.length, 0);
  const tmNone = species.filter((s) => s.tmMoves.length === 0).length;
  console.log(
    `  わざマシン互換 のべ ${tmTotal} 件（1種あたり ${(tmTotal / species.length).toFixed(1)} 技` +
      `${tmNone === 0 ? "" : ` / 0件の種 ${tmNone}`}）`,
  );
  console.log(`  特性 ${abilities.length}（うち ${inert} 件は機構未実装のため inert）`);
  const evoCount = species.reduce((n, s) => n + s.evolutions.length, 0);
  const evoNow = species.reduce(
    (n, s) => n + s.evolutions.filter((e) => e.kind === "level" || e.kind === "levelFriendship").length,
    0,
  );
  console.log(`  進化 ${evoCount} 件（うち今の機構で起きるもの ${evoNow} 件）`);
  const guessed = species.filter((s) => s.baseExpSource === "provisional").length;
  console.log(
    guessed === 0
      ? `  捕獲率・成長曲線・努力値・性別比・与える経験値は全件が公式データ`
      : `  与える経験値は ${species.length - guessed} 件が公式データ / ${guessed} 件が暫定（推定）`,
  );
  console.log(`  持ち物 ${items.length}（うちボール ${balls.length}）/ BattleSet ${battleSets.length}`);
  const parties = named.reduce((n, c) => n + Object.keys(c.tiers).length, 0);
  console.log(
    `  トレーナー ${trainers.length} 人 / 手持ち ${(trainers as { party: unknown[] }[]).reduce((n, t) => n + t.party.length, 0)} 体`,
  );
  console.log(`  ネームド ${named.length} 人 / パーティ ${parties} 件`);
}

main();
