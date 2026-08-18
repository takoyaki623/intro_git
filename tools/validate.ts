/**
 * データ検証。CI で実行し、設計文書のルールを機械で守る。
 *
 * 「文書はいずれ読まれなくなるが、CI は必ず実行される」
 * 設計: docs/design/data-schema.md §6
 *
 *   npx vite-node tools/validate.ts
 */

import {
  DEFAULT_IVS_BY_GRADE,
  STATS,
  TIERS,
  TYPES,
  effectHandlers,
  heldHandlers,
  selectParty,
  type HeldEffect,
  type Move,
  type Species,
  type TierId,
} from "@pkmn/core";
import {
  allAbilities,
  allBattleSets,
  allFacilities,
  allItems,
  allMoves,
  allNamed,
  allSpecies,
  allTournaments,
  gameData,
} from "@pkmn/data";

type Level = "error" | "warn";
type Finding = { level: Level; check: string; message: string };

const findings: Finding[] = [];
const fail = (check: string, message: string) =>
  findings.push({ level: "error", check, message });
const warn = (check: string, message: string) =>
  findings.push({ level: "warn", check, message });

// ─────────────────────────────────────────────
// #1 ID の重複と参照の存在
// ─────────────────────────────────────────────
function checkIds(): void {
  const groups: [string, readonly { id: string }[]][] = [
    ["種族", allSpecies],
    ["技", allMoves],
    ["特性", allAbilities],
    ["道具", allItems],
    ["BattleSet", allBattleSets],
    ["施設", allFacilities],
    ["ネームド", allNamed],
    ["カップ", allTournaments],
  ];
  for (const [label, items] of groups) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) fail("id-unique", `${label}IDが重複: ${item.id}`);
      seen.add(item.id);
      // ID の命名規則: 英小文字・数字・ハイフンのみ
      if (!/^[a-z0-9-]+$/.test(item.id)) {
        fail("id-format", `ID にケバブケース以外の文字: ${item.id}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// #2 タイプ相性が 18×18 で欠けなく埋まっている
// ─────────────────────────────────────────────
function checkTypeChart(): void {
  for (const atk of TYPES) {
    for (const def of TYPES) {
      const v = gameData.typeChart[atk]?.[def];
      if (typeof v !== "number") {
        fail("type-chart", `相性が未定義: ${atk} → ${def}`);
      } else if (![0, 0.5, 1, 2].includes(v)) {
        fail("type-chart", `相性の値が不正: ${atk} → ${def} = ${v}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// #3 全種族に必須フィールドが揃っている
// ─────────────────────────────────────────────
function checkSpecies(): void {
  for (const s of allSpecies) {
    // 検証スクリプトは「まだ型が保証されていない JSON」を相手にする。
    // 宣言上の型を信用すると、実データの異常を検出できない。
    const types = s.types as readonly string[];
    if (types.length === 0 || types.length > 2) {
      fail("species-types", `${s.id}: タイプ数が ${types.length}`);
    }
    for (const t of types) {
      if (!(TYPES as readonly string[]).includes(t)) {
        fail("species-types", `${s.id}: 未知のタイプ ${t}`);
      }
    }
    if (s.types.length === 2 && s.types[0] === s.types[1]) {
      fail("species-types", `${s.id}: 同じタイプが2つ`);
    }
    for (const stat of STATS) {
      const v = s.baseStats[stat];
      if (!Number.isInteger(v) || v < 1 || v > 255) {
        fail("species-stats", `${s.id}: ${stat} が範囲外 (${v})`);
      }
    }
    if (s.catchRate < 1 || s.catchRate > 255) {
      fail("species-catch", `${s.id}: 捕獲率が範囲外 (${s.catchRate})`);
    }
    if (s.abilities.length === 0) fail("species-ability", `${s.id}: 特性が空`);
    if (Object.keys(s.evYield).length === 0) {
      fail("species-ev", `${s.id}: 獲得努力値が空`);
    }
    if (s.learnset.length === 0) fail("species-learnset", `${s.id}: learnset が空`);

    // learnset はレベル昇順であること（表示順がそのまま覚える順になる）
    const levels = s.learnset.map((l) => l.level);
    if (levels.some((lv, i) => i > 0 && lv < levels[i - 1]!)) {
      fail("learnset-order", `${s.id}: learnset がレベル昇順でない`);
    }
    for (const l of s.learnset) {
      if (l.level < 1 || l.level > 100) {
        fail("learnset-level", `${s.id}: 習得レベルが範囲外 (${l.level})`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// #1 learnset が参照する技が存在する
// ─────────────────────────────────────────────
function checkReferences(): void {
  const moveIds = new Set(allMoves.map((m) => m.id));
  for (const s of allSpecies) {
    for (const l of s.learnset) {
      if (!moveIds.has(l.move)) {
        fail("ref-move", `${s.id} の learnset が存在しない技を参照: ${l.move}`);
      }
    }
    // 同じ技を複数レベルで覚えない
    const seen = new Set<string>();
    for (const l of s.learnset) {
      if (seen.has(l.move)) warn("learnset-dup", `${s.id}: ${l.move} が重複`);
      seen.add(l.move);
    }
  }
}

// ─────────────────────────────────────────────
// 技データの妥当性
// ─────────────────────────────────────────────
function checkMoves(): void {
  for (const m of allMoves) {
    if (!TYPES.includes(m.type)) fail("move-type", `${m.id}: 未知のタイプ ${m.type}`);

    if (m.category === "status") {
      if (m.power !== null) fail("move-power", `${m.id}: 変化技に威力がある`);
    } else if (m.power === null || m.power <= 0) {
      fail("move-power", `${m.id}: 攻撃技に威力がない`);
    }

    if (m.accuracy !== null && (m.accuracy < 1 || m.accuracy > 100)) {
      fail("move-accuracy", `${m.id}: 命中率が範囲外 (${m.accuracy})`);
    }
    if (m.pp < 1 || m.pp > 64) fail("move-pp", `${m.id}: PP が範囲外 (${m.pp})`);
    if (m.priority < -7 || m.priority > 5) {
      fail("move-priority", `${m.id}: 優先度が範囲外 (${m.priority})`);
    }

    // #21 全 effect.kind にハンドラが登録されている
    if (m.effect !== undefined) {
      if (effectHandlers[m.effect.kind] === undefined) {
        fail("effect-handler", `${m.id}: 効果 "${m.effect.kind}" にハンドラが無い`);
      }
      if ("chance" in m.effect && (m.effect.chance <= 0 || m.effect.chance > 1)) {
        fail("effect-chance", `${m.id}: 発生確率が 0〜1 の範囲外 (${m.effect.chance})`);
      }
    }

    // 変化技は効果が無いと何も起きない
    if (m.category === "status" && m.effect === undefined) {
      fail("move-effect", `${m.id}: 変化技に効果が無い`);
    }
  }
}

// ─────────────────────────────────────────────
// #16 エンジン未対応の要素をデータが使っていない
// ─────────────────────────────────────────────
const IMPLEMENTED_EFFECTS = new Set(Object.keys(effectHandlers));

/**
 * 原作では専用の機構を必要とする技。
 *
 * これらを「ただの威力技」として入れると、原作より強い別の技になってしまう。
 * 例: はかいこうせんは次ターン反動で動けないから威力150が許されている。
 * 反動を実装しないまま入れると、単に壊れた技になる。
 *
 * 機構を実装したらここから外す。
 */
const NEEDS_UNIMPLEMENTED_MECHANIC: Record<string, string> = {
  "hyper-beam": "次ターンの反動",
  "giga-impact": "次ターンの反動",
  outrage: "複数ターンの連続行動と終了後の混乱",
  thrash: "複数ターンの連続行動と終了後の混乱",
  "petal-dance": "複数ターンの連続行動と終了後の混乱",
  dig: "2ターン技（1ターン目は攻撃を受けない）",
  fly: "2ターン技（1ターン目は攻撃を受けない）",
  "solar-beam": "2ターン技（溜め）",
  "night-shade": "レベルと同じ固定ダメージ",
  "seismic-toss": "レベルと同じ固定ダメージ",
  counter: "受けたダメージを倍返し",
  "close-combat": "2つの能力が同時に下がる（効果は1つまで）",
  superpower: "2つの能力が同時に下がる（効果は1つまで）",
  protect: "その他の防御機構",
  substitute: "みがわり",
  rest: "自分を眠らせて全回復",
};

function checkEngineSupport(): void {
  for (const m of allMoves) {
    const mechanic = NEEDS_UNIMPLEMENTED_MECHANIC[m.id];
    if (mechanic !== undefined) {
      fail(
        "unimplemented-mechanic",
        `${m.id}: 「${mechanic}」が未実装のまま入っている（原作より強い別の技になる）`,
      );
    }
  }
  for (const m of allMoves) {
    if (m.effect !== undefined && !IMPLEMENTED_EFFECTS.has(m.effect.kind)) {
      fail("engine-support", `${m.id}: エンジン未対応の効果 "${m.effect.kind}"`);
    }
    if (m.target !== "foe" && m.target !== "self") {
      fail("engine-support", `${m.id}: エンジン未対応の対象 "${m.target}"`);
    }
  }
}

// ─────────────────────────────────────────────
// 全種族が「戦える」こと（暫定 learnset の品質確認）
// ─────────────────────────────────────────────
function checkBattleReady(): void {
  for (const s of allSpecies) {
    const lv1 = s.learnset.filter((l) => l.level <= 5).map((l) => gameData.move(l.move));
    if (!lv1.some((m) => m.category !== "status")) {
      fail("battle-ready", `${s.id}: Lv5 までに攻撃技を覚えない（初手で戦えない）`);
    }

    // 攻撃技が1タイプしかないと、そのタイプを無効化する相手に手も足も出ない。
    // 例: ノーマル単はゴーストに何もできず、決着しない対面が生まれる。
    const damagingTypes = new Set(
      s.learnset
        .map((l) => gameData.move(l.move))
        .filter((m) => m.category !== "status")
        .map((m) => m.type),
    );
    if (damagingTypes.size < 2) {
      fail(
        "move-coverage",
        `${s.id}: 攻撃技が ${[...damagingTypes].join("/")} のみ（無効タイプに詰む）`,
      );
    }

    // 得意な攻撃側と技の分類が噛み合っているか。
    // とくこうが倍あるのに物理技だけ、のような構成を防ぐ。
    const dmg = s.learnset
      .map((l) => gameData.move(l.move))
      .filter((m) => m.category !== "status");
    if (dmg.length > 0 && s.baseStats.atk !== s.baseStats.spa) {
      const wantsPhysical = s.baseStats.atk > s.baseStats.spa;
      const hasPreferred = dmg.some((m) =>
        m.category === (wantsPhysical ? "physical" : "special"),
      );
      if (!hasPreferred) {
        warn(
          "move-category-fit",
          `${s.id}: ${wantsPhysical ? "こうげき" : "とくこう"}が高いのに` +
            `${wantsPhysical ? "特殊" : "物理"}技しか覚えない`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────
// 特性・持ち物（v0.5）
// ─────────────────────────────────────────────
function checkHeldEffects(): void {
  // #24 全 HeldEffect.kind にハンドラが登録されている
  const check = (label: string, id: string, effect: HeldEffect | undefined) => {
    if (effect === undefined) return;
    if (heldHandlers[effect.kind] === undefined) {
      fail("held-handler", `${label} ${id}: 効果 "${effect.kind}" にハンドラが無い`);
      return;
    }
    // タイプを引数に取る効果は、そのタイプが実在するか
    for (const key of ["moveType", "trapped"] as const) {
      const value = (effect as Record<string, unknown>)[key];
      if (typeof value === "string" && !(TYPES as readonly string[]).includes(value)) {
        fail("held-type", `${label} ${id}: 未知のタイプ ${value}`);
      }
    }
    if (effect.kind === "typeResist") {
      for (const t of effect.moveTypes) {
        if (!(TYPES as readonly string[]).includes(t)) {
          fail("held-type", `${label} ${id}: 未知のタイプ ${t}`);
        }
      }
    }
  };

  for (const a of allAbilities) {
    if (a.effect === undefined) {
      fail("ability-effect", `${a.id}: 効果が無い（何もしないなら inert:理由）`);
      continue;
    }
    check("特性", a.id, a.effect);
  }
  for (const i of allItems) {
    check("道具", i.id, i.held);
    // economy.md §7: お金で個体を強くできない。育成アイテムに価格を付けさせない
    if (i.category === "training" && i.price !== undefined) {
      fail("item-price", `${i.id}: training カテゴリなのに価格がある`);
    }
    if (i.price !== undefined && i.price <= 0) {
      fail("item-price", `${i.id}: 価格が 0 以下 (${i.price})`);
    }
  }

  // 全種族の特性が実在すること
  for (const s of allSpecies) {
    for (const id of s.abilities) {
      if (!allAbilities.some((a) => a.id === id)) {
        fail("ref-ability", `${s.id}: 存在しない特性を参照: ${id}`);
      }
    }
  }

  const inert = allAbilities.filter((a) => a.effect?.kind === "inert");
  if (inert.length > 0) {
    warn(
      "held-inert",
      `${inert.length}/${allAbilities.length} 種の特性は機構未実装のため戦闘中に働かない`,
    );
  }
}

// ─────────────────────────────────────────────
// 施設と相手プール（v0.5）
// ─────────────────────────────────────────────
function checkEndgame(): void {
  for (const set of allBattleSets) {
    const where = `BattleSet ${set.id}`;
    let species: Species | undefined;
    try {
      species = gameData.species(set.species);
    } catch {
      fail("ref-species", `${where}: 存在しない種族 ${set.species}`);
      continue;
    }

    // #6 パーティの技は4つ以下・重複なし
    if (set.moves.length === 0 || set.moves.length > 4) {
      fail("set-moves", `${where}: 技が ${set.moves.length} 個`);
    }
    if (new Set(set.moves).size !== set.moves.length) {
      fail("set-moves", `${where}: 技が重複`);
    }
    for (const id of set.moves) {
      if (!allMoves.some((m) => m.id === id)) {
        fail("ref-move", `${where}: 存在しない技 ${id}`);
      }
    }
    // 特性はその種族が持てるものに限る
    if (!species.abilities.includes(set.ability)) {
      fail("set-ability", `${where}: ${species.name} は特性 ${set.ability} を持たない`);
    }
    const item = allItems.find((i) => i.id === set.item);
    if (item === undefined) {
      fail("ref-item", `${where}: 存在しない道具 ${set.item}`);
    } else if (item.held?.kind === "statMultiplier" && item.held.banStatusMoves === true) {
      // とつげきチョッキ等は変化技を封じる。持たせた上で変化技を入れると、
      // その技は永久に選べない ―― 選べない技を持つデータは誤りとして落とす
      const dead = set.moves.filter((id) => gameData.move(id).category === "status");
      if (dead.length > 0) {
        fail("set-unusable-move", `${where}: ${item.name} で使えない変化技 ${dead.join(",")}`);
      }
    }
    try {
      gameData.nature(set.nature);
    } catch {
      fail("ref-nature", `${where}: 存在しない性格 ${set.nature}`);
    }
    // #5 努力値合計 ≤ 510、各 ≤ 252
    let total = 0;
    for (const [stat, value] of Object.entries(set.evs)) {
      if (!(STATS as readonly string[]).includes(stat)) {
        fail("set-evs", `${where}: 未知の能力 ${stat}`);
      }
      if (value > 252) fail("set-evs", `${where}: ${stat} が 252 超`);
      total += value;
    }
    if (total > 510) fail("set-evs", `${where}: 努力値の合計が ${total}`);
  }

  for (const facility of allFacilities) {
    const where = `施設 ${facility.id}`;
    const rules = facility.ruleset;

    // #16 エンジン未対応の要素をデータが使っていない
    if (rules.battleFormat !== "single") {
      fail("unimplemented-mechanic", `${where}: ダブルバトルはエンジン未対応（v1.2）`);
    }
    if (rules.moveSelection !== "player") {
      fail("unimplemented-mechanic", `${where}: パレス式の行動代行が未実装`);
    }
    if (rules.itemsAllowed) {
      fail("unimplemented-mechanic", `${where}: 戦闘中の道具使用が未実装（v0.9）`);
    }
    if (rules.winCondition.kind !== "faint") {
      fail("unimplemented-mechanic", `${where}: 採点による決着が未実装`);
    }
    if (rules.teamSource !== "rental") {
      fail(
        "unimplemented-mechanic",
        `${where}: v0.5 では手持ちの個体が存在しないため rental 以外は成立しない（v0.8）`,
      );
    }

    // レンタルは相手より強い grade でないと連勝が伸びない（0.5^n が効くため）
    if (rules.teamSource === "rental") {
      const first = facility.bands[0];
      if (first !== undefined && facility.rentalGrade <= first.grade) {
        fail(
          "rental-grade",
          `${where}: レンタル grade ${facility.rentalGrade} が最初の相手 grade ${first.grade} 以下（1戦の勝率が五分になり連勝が成立しない）`,
        );
      }
      const rentals = allBattleSets.filter((s) => s.grade === facility.rentalGrade).length;
      if (rentals < rules.teamSize * 2) {
        fail("rental-count", `${where}: レンタル候補が ${rentals} 件（選ぶ意味が出ない）`);
      }
    }

    // #13 BattleSet が各 grade に十分な件数ある
    for (const band of facility.bands) {
      const count = allBattleSets.filter((s) => s.grade === band.grade).length;
      if (count < rules.teamSize) {
        fail("set-count", `${where}: grade ${band.grade} が ${count} 件（${rules.teamSize} 件必要）`);
      }
      if (count < rules.teamSize * 2) {
        warn("set-variety", `${where}: grade ${band.grade} が ${count} 件しかなく顔ぶれが偏る`);
      }
      if (band.policy === "smart") {
        fail("unimplemented-mechanic", `${where}: AI smart は未実装（v1.1）`);
      }
      if (DEFAULT_IVS_BY_GRADE[band.grade] === undefined) {
        fail("set-grade", `${where}: 未知の grade ${band.grade}`);
      }
    }
    // 帯と BP の区切りが単調増加している（読み飛ばしが起きないこと）
    const monotone = (rows: { upTo: number }[], name: string) => {
      for (const [i, row] of rows.entries()) {
        if (i > 0 && row.upTo <= rows[i - 1]!.upTo) {
          fail("band-order", `${where}: ${name} の区切りが単調増加でない`);
        }
      }
    };
    monotone(facility.bands, "bands");
    monotone(facility.bpByStreak, "bpByStreak");

    const last = facility.bands[facility.bands.length - 1];
    if (last === undefined || last.upTo < facility.streakCap) {
      fail("band-coverage", `${where}: 連勝上限 ${facility.streakCap} を覆う帯が無い`);
    }
  }
}

// ─────────────────────────────────────────────
// ネームドとトーナメント（v0.6）
// ─────────────────────────────────────────────
function checkNamed(): void {
  const tacticUsers = new Map<string, string[]>();

  for (const character of allNamed) {
    const where = `ネームド ${character.id}`;

    // #10 concept を先に書く。theme が無いキャラは構築を組んでも「らしさ」が出ない
    if ((character.concept?.theme ?? "") === "") {
      fail("named-theme", `${where}: theme が空`);
    }
    if (character.concept?.type !== undefined
        && !(TYPES as readonly string[]).includes(character.concept.type)) {
      fail("named-type", `${where}: 未知の専門タイプ ${character.concept.type}`);
    }
    // チャンピオンだけがタイプ縛りを持たない（だから最も強くなる）
    if (character.role !== "champion" && character.concept?.type === undefined) {
      warn("named-type", `${where}: 専門タイプが無い（チャンピオン以外は珍しい）`);
    }
    if (character.concept?.tactic !== undefined) {
      const users = tacticUsers.get(character.concept.tactic) ?? [];
      users.push(character.id);
      tacticUsers.set(character.concept.tactic, users);
    }

    let signatureOk = true;
    try {
      gameData.species(character.signature);
    } catch {
      fail("ref-species", `${where}: signature が存在しない種族 ${character.signature}`);
      signatureOk = false;
    }

    const tiers = Object.keys(character.tiers ?? {});
    if (tiers.length === 0) fail("named-tiers", `${where}: パーティが1つも無い`);
    for (const tier of tiers) {
      if (!(TIERS as readonly string[]).includes(tier)) {
        fail("named-tiers", `${where}: 未知のティア ${tier}`);
        continue;
      }
      const party = character.tiers[tier as TierId]!;
      const label = `${where}/${tier}`;

      if (party.length === 0 || party.length > 6) {
        fail("named-party", `${label}: ${party.length}体`);
      }
      // #10 signature が全ティアに含まれる ―― 「同じキャラだ」と認識できる最低条件
      if (signatureOk && !party.some((m) => m.species === character.signature)) {
        fail("named-signature", `${label}: エース ${character.signature} が居ない`);
      }

      const items = new Set<string>();
      for (const m of party) {
        let species: Species;
        try {
          species = gameData.species(m.species);
        } catch {
          fail("ref-species", `${label}: 存在しない種族 ${m.species}`);
          continue;
        }
        if (m.level < 1 || m.level > 100) fail("named-level", `${label}: Lv${m.level} が範囲外`);
        if (m.moves.length === 0 || m.moves.length > 4) {
          fail("named-party", `${label}/${m.species}: 技が ${m.moves.length} 個`);
        }
        if (new Set(m.moves).size !== m.moves.length) {
          fail("named-party", `${label}/${m.species}: 技が重複`);
        }
        for (const id of m.moves) {
          if (!allMoves.some((x) => x.id === id)) {
            fail("ref-move", `${label}/${m.species}: 存在しない技 ${id}`);
          }
        }
        if (m.ability !== undefined && !species.abilities.includes(m.ability)) {
          fail("named-ability", `${label}: ${species.name} は特性 ${m.ability} を持たない`);
        }
        if (m.nature !== undefined) {
          try {
            gameData.nature(m.nature);
          } catch {
            fail("ref-nature", `${label}/${m.species}: 存在しない性格 ${m.nature}`);
          }
        }
        if (m.item !== undefined) {
          const item = allItems.find((x) => x.id === m.item);
          if (item === undefined) {
            fail("ref-item", `${label}/${m.species}: 存在しない道具 ${m.item}`);
          } else {
            if (item.held?.kind === "statMultiplier" && item.held.banStatusMoves === true) {
              const dead = m.moves.filter((id) => gameData.move(id).category === "status");
              if (dead.length > 0) {
                fail("named-unusable-move", `${label}/${m.species}: ${item.name} で使えない ${dead.join(",")}`);
              }
            }
            // 原作ティアは持ち物なしなので、重複を見るのは構築したティアだけ
            if (tier !== "original") {
              if (items.has(m.item)) {
                fail("named-item-dup", `${label}: 持ち物 ${item.name} が重複`);
              }
              items.add(m.item);
            }
          }
        }
        // #5 努力値合計 ≤ 510、各 ≤ 252
        let total = 0;
        for (const [stat, value] of Object.entries(m.evs ?? {})) {
          if (!(STATS as readonly string[]).includes(stat)) {
            fail("named-evs", `${label}/${m.species}: 未知の能力 ${stat}`);
          }
          if (value > 252) fail("named-evs", `${label}/${m.species}: ${stat} が 252 超`);
          total += value;
        }
        if (total > 510) fail("named-evs", `${label}/${m.species}: 努力値の合計が ${total}`);
      }
    }
  }

  // #11 同一戦術が3人以上なら警告（全キャラが同じ戦術に収束していないか）
  for (const [tactic, users] of tacticUsers) {
    if (users.length >= 3) {
      warn("named-tactic", `戦術 "${tactic}" が ${users.length} 人で重複: ${users.join(",")}`);
    }
  }
}

function checkTournaments(): void {
  for (const cup of allTournaments) {
    const where = `カップ ${cup.id}`;
    const rules = cup.ruleset;

    if (rules.battleFormat !== "single") {
      fail("unimplemented-mechanic", `${where}: ダブルバトルはエンジン未対応（v1.2）`);
    }
    if (rules.moveSelection !== "player") {
      fail("unimplemented-mechanic", `${where}: パレス式の行動代行が未実装`);
    }
    if (rules.teamSource !== "rental") {
      fail(
        "unimplemented-mechanic",
        `${where}: v0.6 では手持ちの個体が存在しないため rental 以外は成立しない（v0.8）`,
      );
    }
    if (cup.rounds < 1) fail("cup-rounds", `${where}: rounds が ${cup.rounds}`);

    // #27 出場者プールが解放条件と整合している（今はカントーのみ）
    for (const id of cup.entrantPool) {
      if (!allNamed.some((c) => c.id === id)) {
        fail("ref-named", `${where}: 出場者 ${id} が存在しない`);
      }
    }
    if (new Set(cup.entrantPool).size !== cup.entrantPool.length) {
      fail("cup-pool", `${where}: 出場者が重複`);
    }

    for (const tier of cup.tierProgression) {
      if (!(TIERS as readonly string[]).includes(tier)) {
        fail("cup-tier", `${where}: 未知のティア ${tier}`);
        continue;
      }
      if (tier === "ultimate") {
        fail("unimplemented-mechanic", `${where}: 極ティアは AI smart と同時（v1.1）`);
      }
      const eligible = allNamed.filter(
        (c) => cup.entrantPool.includes(c.id) && c.tiers[tier] !== undefined,
      );
      if (eligible.length < cup.rounds) {
        fail("cup-pool", `${where}/${tier}: 出場者 ${eligible.length} 人（${cup.rounds} 人必要）`);
      } else if (eligible.length === cup.rounds) {
        warn("cup-variety", `${where}/${tier}: 出場者がちょうど ${cup.rounds} 人で毎回同じ顔ぶれになる`);
      }

      // 3対3のカップで、エースが選から漏れないこと（selectParty の妥当性）
      for (const character of eligible) {
        const party = character.tiers[tier]!;
        const picked = selectParty(character, party, rules.teamSize);
        if (picked.length !== Math.min(rules.teamSize, party.length)) {
          fail("cup-select", `${where}/${tier}/${character.id}: 選出が ${picked.length}体`);
        }
        if (!picked.some((m) => m.species === character.signature)) {
          fail("cup-select", `${where}/${tier}/${character.id}: 選出でエースが落ちる`);
        }
      }
    }

    for (const tier of cup.tierProgression) {
      const grade = cup.rentalGradeByTier[tier];
      if (grade === undefined) {
        fail("rental-grade", `${where}/${tier}: レンタルの grade が未指定`);
        continue;
      }
      const count = allBattleSets.filter((s) => s.grade === grade).length;
      if (count < rules.teamSize * 2) {
        fail("rental-count", `${where}/${tier}: レンタル候補が ${count} 件（選ぶ意味が出ない）`);
      }
    }
    // ティアが上がるほどレンタルも上がる（相手と同じ投資水準を貸す）
    const grades = cup.tierProgression.map((t) => cup.rentalGradeByTier[t] ?? 0);
    if (grades.some((g, i) => i > 0 && g < grades[i - 1]!)) {
      fail("rental-grade", `${where}: 上のティアでレンタルが弱くなっている`);
    }
  }
}

// ─────────────────────────────────────────────
// データの由来を報告する（誤りではないが可視化する）
// ─────────────────────────────────────────────
function reportProvenance(): void {
  const provisional = allSpecies.filter(
    (s) => (s as Species & { learnsetSource?: string }).learnsetSource === "provisional",
  );
  if (provisional.length > 0) {
    warn(
      "provenance",
      `${provisional.length}/${allSpecies.length} 種の learnset が暫定（原作の習得レベルではない）`,
    );
  }
}

// ─────────────────────────────────────────────
function main(): void {
  checkIds();
  checkTypeChart();
  checkSpecies();
  checkReferences();
  checkMoves();
  checkEngineSupport();
  checkBattleReady();
  checkHeldEffects();
  checkEndgame();
  checkNamed();
  checkTournaments();
  reportProvenance();

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");

  console.log(
    `検証対象: 種族 ${allSpecies.length} / 技 ${allMoves.length} / ` +
      `特性 ${allAbilities.length} / 道具 ${allItems.length} / ` +
      `BattleSet ${allBattleSets.length} / 施設 ${allFacilities.length} / ` +
      `ネームド ${allNamed.length} / カップ ${allTournaments.length}`,
  );

  for (const f of warns) console.log(`  警告 [${f.check}] ${f.message}`);
  for (const f of errors) console.error(`  エラー [${f.check}] ${f.message}`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} 件のエラー`);
    process.exit(1);
  }
  console.log(`\n検証を通過（警告 ${warns.length} 件）`);
}

main();

export type { Finding, Move, Species };
