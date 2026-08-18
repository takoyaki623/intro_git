/**
 * 公式データの取り込み（v0.8）。
 *
 * v0.4 で入れた learnset は**規則生成の暫定値**だった。
 * 正確な習得レベルが手元に無かったためで、`learnsetSource: "provisional"` を立てて
 * 検証が毎回そう報告していた（game-plan.md §8.6）。
 *
 * `@pkmn/dex`（Pokémon Showdown のデータ）から実データを取れることが分かったので、
 * それを **source/learnsets.tsv として書き出してコミットする。**
 *
 *   なぜ import 時に直接読まないか
 *   ── ビルドを外部データに依存させないため。取り込みは人が明示的に走らせ、
 *      結果は git の差分として読めるようにする（マップの原本と同じ考え方）。
 *
 *   npx vite-node tools/fetch-official.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Dex } from "@pkmn/dex";

const DATA = "packages/data";
const OUT = `${DATA}/source/learnsets.tsv`;
const TODO = `${DATA}/source/moves-todo.tsv`;
const EVOLUTIONS = `${DATA}/source/evolutions.tsv`;

/**
 * 新しい世代から順に降りる。
 * カントー151種のうち約1/3は SV に居ないので、第9世代だけでは埋まらない。
 */
const GENS = [9, 8, 7, 6, 5, 4, 3] as const;

/** Showdown の ID は区切り無し（`vinewhip`）。当プロジェクトは `vine-whip`。 */
const flat = (id: string) => id.replace(/[^a-z0-9]/g, "");

type Learned = { level: number; move: string };

function levelUpMoves(sources: readonly string[], gen: number): number[] {
  const out: number[] = [];
  for (const source of sources) {
    const m = new RegExp(`^${gen}L(\\d+)$`).exec(source);
    // Lv0 は「進化して覚える」等の印。レベル1として扱う
    if (m !== null) out.push(Math.max(1, Number(m[1])));
  }
  return out;
}

async function main(): Promise<void> {
  const species = JSON.parse(readFileSync(`${DATA}/species.json`, "utf8")) as {
    id: string;
    name: string;
  }[];
  // 生成物ではなく原本を読む。
  // moves.json を読むと「技を足す → import → ここ → import」の順序に縛られ、
  // 1回目の import を忘れると learnset が静かに薄くなる（実際に一度やった）
  const ourMoves = readFileSync(`${DATA}/source/moves.tsv`, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t")[0]!);
  const byFlat = new Map(ourMoves.map((id) => [flat(id), id]));

  const dex = Dex.forGen(9);
  const rows: string[] = [];
  const usedGen = new Map<number, number>();
  /** 当プロジェクトに存在しない技 → 必要としている種の数。 */
  const missing = new Map<string, number>();
  let total = 0;
  let kept = 0;

  for (const s of species) {
    const learnset = await dex.learnsets.get(s.id);
    const entries = Object.entries(learnset?.learnset ?? {});

    let picked: { gen: number; moves: Learned[] } | null = null;
    for (const gen of GENS) {
      const moves: Learned[] = [];
      for (const [move, sources] of entries) {
        for (const level of levelUpMoves(sources, gen)) moves.push({ level, move });
      }
      if (moves.length > 0) {
        picked = { gen, moves };
        break;
      }
    }
    if (picked === null) {
      throw new Error(`${s.id}: どの世代にもレベル技が無い`);
    }

    usedGen.set(picked.gen, (usedGen.get(picked.gen) ?? 0) + 1);
    total += picked.moves.length;

    const have: Learned[] = [];
    for (const entry of picked.moves) {
      const ours = byFlat.get(entry.move);
      if (ours === undefined) {
        missing.set(entry.move, (missing.get(entry.move) ?? 0) + 1);
        continue;
      }
      have.push({ level: entry.level, move: ours });
    }
    kept += have.length;

    // 同じ技が複数レベルに現れることがある。いちばん早いものを採る
    const earliest = new Map<string, number>();
    for (const entry of have) {
      const before = earliest.get(entry.move);
      if (before === undefined || entry.level < before) earliest.set(entry.move, entry.level);
    }
    const list = [...earliest]
      .map(([move, level]) => ({ move, level }))
      .sort((a, b) => a.level - b.level || a.move.localeCompare(b.move));

    rows.push(`${s.id}\t${picked.gen}\t${list.map((l) => `${l.level}:${l.move}`).join(",")}`);
  }

  writeFileSync(OUT, `species\tgen\tlearnset\n${rows.join("\n")}\n`, "utf8");
  console.log(`${OUT} … ${rows.length} 種`);
  console.log(
    `  採用世代: ${[...usedGen].sort((a, b) => b[0] - a[0]).map(([g, n]) => `第${g}世代 ${n}種`).join(" / ")}`,
  );
  console.log(`  レベル技 のべ ${total} 件 / 当プロジェクトに存在 ${kept} 件 (${((kept / total) * 100).toFixed(0)}%)`);

  writeCandidates(dex, missing);
  writeEvolutions(dex, new Set(species.map((s) => s.id)));
}

/**
 * 進化の条件（v0.8）。
 *
 * カントーの外へ進化する枝（クロバット・ハッサム等）は落とす ――
 * 地方ごとにデータを閉じる方針（regions.md §8）に従い、
 * その地方を実装したときに繋がる。
 *
 * 通信交換進化は原作のままでは成立しないので、
 * `trade` として書き出しておき、進行側で「つながりのヒモ」に置き換える
 * （progression.md §11）。
 */
function writeEvolutions(dex: ReturnType<typeof Dex.forGen>, inRegion: ReadonlySet<string>): void {
  const rows: string[] = [];
  const kinds = new Map<string, number>();

  for (const id of inRegion) {
    for (const evoId of dex.species.get(id)?.evos ?? []) {
      const evo = dex.species.get(evoId);
      if (evo === undefined || !inRegion.has(evo.id)) continue;

      const kind = evo.evoType ?? "level";
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      rows.push(
        [
          id,
          evo.id,
          kind,
          String(evo.evoLevel ?? ""),
          evo.evoItem === undefined ? "" : kebab(evo.evoItem),
          evo.evoCondition ?? "",
        ].join("\t"),
      );
    }
  }

  rows.sort();
  writeFileSync(EVOLUTIONS, `from\tto\tkind\tlevel\titem\tcondition\n${rows.join("\n")}\n`, "utf8");
  console.log(`${EVOLUTIONS} … ${rows.length} 件`);
  console.log(`  条件: ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" / ")}`);
}

/**
 * 足りない技の候補を書き出す。
 *
 * **今ある効果の種類だけで表せるものに限る。**
 * v0.4 で「原作の機構を要する技をただの威力技として入れると別物になる」と決めた
 * （data-schema.md §6）。天候・場の効果・溜め技などはここで落とす。
 */
function writeCandidates(dex: ReturnType<typeof Dex.forGen>, missing: Map<string, number>): void {
  const rows: { id: string; need: number; line: string }[] = [];
  const rejected = new Map<string, number>();
  /** まだ入っていない技と、その理由。`inert` な特性と同じで、理由つきで残す。 */
  const todo: { id: string; name: string; reason: string; need: number }[] = [];

  for (const [flatId, need] of missing) {
    const m = dex.moves.get(flatId);
    if (m === undefined || !m.exists) continue;

    const manual = MANUAL_REJECT[kebab(m.name)];
    if (manual !== undefined) {
      rejected.set("制約が強さを釣り合わせている", (rejected.get("制約が強さを釣り合わせている") ?? 0) + 1);
      todo.push({ id: kebab(m.name), name: m.name, reason: manual, need });
      continue;
    }

    const reason = unsupportedReason(m as unknown as DexMoveShape);
    if (reason !== null) {
      rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
      todo.push({ id: kebab(m.name), name: m.name, reason, need });
      continue;
    }

    const id = kebab(m.name);
    const effect = effectOf(m as unknown as EffectShape);

    // 変化技なのに効果が空 = 毎回「うまく きまらなかった」になる。入れる意味が無い
    if (m.category === "Status" && effect === "") {
      rejected.set("効果を表せない", (rejected.get("効果を表せない") ?? 0) + 1);
      todo.push({ id, name: m.name, reason: "効果を表せない", need });
      continue;
    }

    rows.push({
      id,
      need,
      line: [
        id,
        "", // 日本語名は人が書く（自動で入れられる出どころが無い）
        m.type.toLowerCase(),
        m.category.toLowerCase(),
        m.basePower === 0 ? "-" : String(m.basePower),
        m.accuracy === true ? "-" : String(m.accuracy),
        String(m.pp),
        String(m.priority),
        String(m.critRatio !== undefined && m.critRatio > 1 ? m.critRatio - 1 : 0),
        m.flags?.contact === 1 ? "1" : "0",
        effect,
        effect.startsWith("heal:") || SELF_TARGETS.has(m.target ?? "") ? "self" : "foe",
        String(need),
      ].join("\t"),
    });
  }

  rows.sort((a, b) => b.need - a.need || a.id.localeCompare(b.id));
  for (const r of rows) {
    todo.push({ id: r.id, name: r.id, reason: "追加できる（日本語名が要る）", need: r.need });
  }

  // 未追加の技を理由つきで残す。
  // 「入れていない」ことを黙って放置すると、入れ忘れと区別が付かなくなる。
  // inert な特性に理由を書かせているのと同じ運用（data-schema.md §6）
  todo.sort((a, b) => b.need - a.need || a.id.localeCompare(b.id));
  writeFileSync(
    TODO,
    `id\tenglish\treason\tneededBy\n${todo
      .map((t) => `${t.id}\t${t.name}\t${t.reason}\t${t.need}`)
      .join("\n")}\n`,
    "utf8",
  );
  console.log(`${TODO} … 未追加 ${todo.length} 件（うち今の効果で表せるもの ${rows.length} 件）`);
  console.log(
    `  内訳: ${[...rejected].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" / ")}`,
  );
}

/**
 * 外部データの形。`@pkmn/dex` の `Move` をそのまま受けると
 * exactOptionalPropertyTypes と噛み合わないので、必要な項目だけを写した形で受ける。
 */
type DexMoveShape = {
  weather?: string; terrain?: string; sideCondition?: string; slotCondition?: string;
  pseudoWeather?: string; volatileStatus?: string; selfSwitch?: unknown; forceSwitch?: boolean;
  flags?: Record<string, number | undefined>;
  ohko?: unknown; multiaccuracy?: boolean; damageCallback?: unknown; basePowerCallback?: unknown;
  category?: string; basePower?: number; name?: string;
  self?: { volatileStatus?: string; boosts?: Record<string, number> };
  boosts?: Record<string, number>;
  secondaries?: { boosts?: Record<string, number>; self?: { boosts?: Record<string, number> } }[];
};

/** 今の機構で表せない理由。表せるなら null。 */
function unsupportedReason(m: DexMoveShape): string | null {
  if (m.weather !== undefined) return "天候";
  if (m.terrain !== undefined) return "フィールド";
  if (m.sideCondition !== undefined || m.slotCondition !== undefined) return "場の効果";
  if (m.pseudoWeather !== undefined) return "場の効果";
  if (m.volatileStatus !== undefined && !["confusion", "flinch"].includes(m.volatileStatus)) {
    return "未実装の状態";
  }
  if (m.self?.volatileStatus !== undefined) return "自分への継続効果";
  if (m.selfSwitch !== undefined || m.forceSwitch === true) return "交代を伴う技";
  if (m.flags?.charge === 1 || m.flags?.recharge === 1) return "溜め・反動休み";
  if (m.ohko !== undefined || m.multiaccuracy === true) return "特殊な命中判定";
  if (m.damageCallback !== undefined || m.basePowerCallback !== undefined) return "威力が可変";
  for (const hook of HOOKS) {
    if ((m as Record<string, unknown>)[hook] !== undefined) return "個別処理";
  }

  // 威力0の攻撃技は「威力が状況で決まる」技（ジャイロボール・けたぐり等）。
  // データからは 0 にしか見えないので、そのまま入れると威力0の技になる
  if (m.category !== "Status" && m.basePower === 0) return "威力が可変";

  // 能力変化が2つ以上ある技は今の statChange で表せない
  // （つるぎのまい型は1つ。りゅうのまい・からをやぶるは複数）
  if (m.boosts !== undefined && Object.keys(m.boosts).length > 1) return "能力変化が複数";
  if (m.self?.boosts !== undefined && Object.keys(m.self.boosts).length > 1) return "能力変化が複数";
  if ((m.secondaries?.length ?? 0) > 1) return "追加効果が複数";
  for (const s of m.secondaries ?? []) {
    if (s.boosts !== undefined && Object.keys(s.boosts).length > 1) return "能力変化が複数";
    if (s.self?.boosts !== undefined && Object.keys(s.self.boosts).length > 1) return "能力変化が複数";
  }
  return null;
}

/**
 * 手で外した技。
 *
 * **共通しているのは「制約が強さを釣り合わせている技」。**
 * データからは制約が見えず、抜き取ると原作より強い別物になる。
 * v0.4 ではかいこうせん を弾いたのと同じ理由で、ここに並べる。
 */
const MANUAL_REJECT: Record<string, string> = {
  "sucker-punch": "相手が攻撃技を選んだときしか成功しない",
  "fake-out": "出た直後の1回しか使えない",
  "last-resort": "他の技を全て使ってからでないと出せない",
  belch: "きのみを食べてからでないと出せない",
  "future-sight": "2ターン後に当たる",
  swagger: "相手の攻撃を2段階上げる代償がある",
  flatter: "相手のとくこうを上げる代償がある",
  snore: "自分が眠っていないと出せない",
  "dream-eater": "相手が眠っていないと当たらない",
  "axe-kick": "外すと自分がダメージを受ける",
  "high-jump-kick": "外すと自分がダメージを受ける",
  "jump-kick": "外すと自分がダメージを受ける",
  "shadow-force": "溜めが要る",
};

/** ここに引っかかる技は原作の固有処理を持つ。威力だけ写すと別物になる（v0.4 の教訓）。 */
const HOOKS = [
  "onHit", "onTryHit", "onModifyMove", "onAfterHit", "onBasePower",
  "onEffectiveness", "onDamage", "onTry", "onPrepareHit", "onMoveFail",
  "onAfterMoveSecondarySelf", "onAfterSubDamage", "beforeTurnCallback",
  "condition", "selfdestruct", "stallingMove", "smartTarget", "tracksTarget",
] as const;

/** effectOf が読む項目。 */
type EffectShape = {
  status?: string; volatileStatus?: string;
  self?: { boosts?: Record<string, number> };
  boosts?: Record<string, number>; heal?: number[]; drain?: number[];
  recoil?: number[]; multihit?: number | number[]; target?: string;
  secondaries?: { chance?: number; status?: string; volatileStatus?: string; boosts?: Record<string, number>; self?: { boosts?: Record<string, number> } }[];
};

/** Showdown の技データ → 当プロジェクトの effect 列。 */
function effectOf(m: EffectShape): string {
  const ratio = (pair: number[] | undefined) =>
    pair === undefined ? undefined : (pair[0]! / pair[1]!).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");

  if (m.heal !== undefined) return `heal:${ratio(m.heal)}`;
  if (m.drain !== undefined) return `drain:${ratio(m.drain)}`;
  if (m.recoil !== undefined) return `recoil:${ratio(m.recoil)}`;
  if (m.multihit !== undefined) {
    const [lo, hi] = Array.isArray(m.multihit) ? m.multihit : [m.multihit, m.multihit];
    return `multiHit:${lo}:${hi}`;
  }
  // 主効果（変化技）
  if (m.status !== undefined) return `status:${statusId(m.status)}:1`;
  if (m.volatileStatus === "confusion") return "confuse:1";
  if (m.volatileStatus === "flinch") return "flinch:1";
  if (m.boosts !== undefined) {
    const [stat, stages] = Object.entries(m.boosts)[0]!;
    return `statChange:${SELF_TARGETS.has(m.target ?? "") ? "self" : "foe"}:${stat}:${stages}:1`;
  }
  // 反動として自分の能力が下がる技（オーバーヒート・インファイト型）。
  // 落とすと「代償のない大威力技」になってしまう
  if (m.self?.boosts !== undefined) {
    const [stat, stages] = Object.entries(m.self.boosts)[0]!;
    return `statChange:self:${stat}:${stages}:1`;
  }

  // 追加効果（攻撃技）
  const s = m.secondaries?.[0];
  if (s !== undefined) {
    const chance = ((s.chance ?? 100) / 100).toString();
    if (s.status !== undefined) return `status:${statusId(s.status)}:${chance}`;
    if (s.volatileStatus === "flinch") return `flinch:${chance}`;
    if (s.volatileStatus === "confusion") return `confuse:${chance}`;
    if (s.boosts !== undefined) {
      const [stat, stages] = Object.entries(s.boosts)[0]!;
      return `statChange:foe:${stat}:${stages}:${chance}`;
    }
    if (s.self?.boosts !== undefined) {
      const [stat, stages] = Object.entries(s.self.boosts)[0]!;
      return `statChange:self:${stat}:${stages}:${chance}`;
    }
  }
  return "";
}

const statusId = (s: string) =>
  ({ psn: "poison", tox: "toxic", par: "paralysis", brn: "burn", slp: "sleep", frz: "freeze" })[s] ?? s;

/** 自分（と味方）に効く技。とおぼえ のように味方向けのものも自分に効く。 */
const SELF_TARGETS = new Set(["self", "allySide", "allies", "adjacentAllyOrSelf", "allyTeam"]);

/** "Water Pulse" → "water-pulse" */
const kebab = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

await main();
