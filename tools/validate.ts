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
  STATUSES,
  TIERS,
  TYPES,
  effectHandlers,
  heldHandlers,
  assertAllEventCommandsHandled,
  flagsUsedBy,
  evolutionLine,
  JUDGE_CRITERIA,
  selectParty,
  walkCommands,
  type Condition,
  type EventCommand,
  type HeldEffect,
  type MapData,
  type MapObject,
  type Warp,
  type Move,
  type Species,
  type TierId,
  type UseEffect,
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
  allEncounterTables,
  allEvents,
  allFieldAbilities,
  allFlags,
  allMaps,
  allRegions,
  allShops,
  allTrainers,
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
    // learnset が空でも誤りではない（v0.8）。
    // アブラは テレポート、メタモンは へんしん しかレベルで覚えず、
    // どちらも当プロジェクトにまだ無い機構を要する技。原作の事実をそのまま残す
    if (s.learnset.length === 0) warn("species-learnset", `${s.id}: レベルで覚える技が無い`);

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
  // ── v0.8 で意味が変わった検証 ──
  //
  // v0.4〜v0.7 の learnset は**規則生成の暫定値**だった。
  // 「Lv5 までに攻撃技を覚える」「攻撃技のタイプが2種類以上」は、
  // その生成規則が守るべき品質条件として書いたもので、エラーにしていた。
  //
  // 公式データを入れた今、これらは**原作の事実**になった ――
  // メタモンは へんしん しか覚えないし、アブラは テレポート だけ。
  // データの誤りではないので、**エラーではなく一覧の報告**にする。
  const cantFight: string[] = [];
  const oneType: string[] = [];

  for (const s of allSpecies) {
    const lv1 = s.learnset.filter((l) => l.level <= 5).map((l) => gameData.move(l.move));
    if (!lv1.some((m) => m.category !== "status")) cantFight.push(s.id);

    // 攻撃技が1タイプしかないと、そのタイプを無効化する相手に手も足も出ない。
    // 例: ノーマル単はゴーストに何もできず、わるあがきでしか進まない対面になる。
    const damagingTypes = new Set(
      s.learnset
        .map((l) => gameData.move(l.move))
        .filter((m) => m.category !== "status")
        .map((m) => m.type),
    );
    if (damagingTypes.size < 2) oneType.push(s.id);

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

  if (cantFight.length > 0) {
    warn(
      "battle-ready",
      `Lv5 までに攻撃技を覚えない ${cantFight.length} 種（原作どおり）: ${cantFight.join(" ")}`,
    );
  }
  if (oneType.length > 0) {
    warn(
      "move-coverage",
      `レベル技の攻撃タイプが1種類だけ ${oneType.length} 種: ${oneType.join(" ")}`,
    );
  }

  // ── 実際に戦えるか ──
  // 上の2つと違い、これは**遊べるかどうか**に直結する。
  // 野生で出てくる種が わるあがき しかできないと、戦闘が成立しない
  //
  // **「Lv5 まで」ではなく「実際に出るレベルまで」を見る**（v0.12-d）。
  // 固定の 5 で測っていたので、なみのり の表を Lv10〜 で作っても
  // 「Lv5 で技が無い」と言われた ―― 測る対象が違えば、通っても落ちても意味が無い。
  const lowestWildLevel = new Map<string, number>();
  for (const table of allEncounterTables) {
    for (const entry of table.entries) {
      const at = Math.min(entry.levelRange[0], entry.levelRange[1]);
      const seen = lowestWildLevel.get(entry.species);
      lowestWildLevel.set(entry.species, seen === undefined ? at : Math.min(seen, at));
    }
  }
  for (const [id, level] of lowestWildLevel) {
    const s = allSpecies.find((x) => x.id === id)!;
    if (!s.learnset.some((l) => l.level <= level)) {
      fail("wild-usable", `${id}: 野生で Lv${level} から出るのに、そこまでに技を1つも覚えない`);
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
    // #66 お金と BP は別の経済（economy.md §7）。両方で買えるものを作らない
    if (i.price !== undefined && i.bpPrice !== undefined) {
      fail("item-price", `${i.id}: お金でも BP でも買える（経済が混ざる）`);
    }
    if (i.bpPrice !== undefined && i.bpPrice <= 0) {
      fail("item-price", `${i.id}: BP価格が 0 以下 (${i.bpPrice})`);
    }
    // #67 持ち物は必ずどこかで手に入る。**置いたのに買えない持ち物を作らない**
    if (i.category === "held" && i.price === undefined && i.bpPrice === undefined) {
      fail("item-source", `${i.id}: お金でも BP でも手に入らない持ち物`);
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

/**
 * 道具の「つかう」効果とショップ（v0.9）。
 *
 * 検証項目 #61〜#65。
 */
function checkUseEffects(): void {
  const walk = (id: string, effect: UseEffect): void => {
    // #61 全 UseEffect.kind に処理がある
    if (!USE_KINDS.includes(effect.kind)) {
      fail("use-handler", `${id}: 効果 "${effect.kind}" に処理が無い`);
      return;
    }
    if (effect.kind === "cure") {
      // #62 治せる状態異常が実在する
      for (const st of effect.status) {
        if (!(STATUSES as readonly string[]).includes(st)) {
          fail("use-status", `${id}: 未知の状態異常 ${st}`);
        }
      }
    }
    if (effect.kind === "multi") {
      if (effect.of.length < 2) fail("use-multi", `${id}: multi なのに効果が1つ以下`);
      for (const each of effect.of) walk(id, each);
    }
  };

  for (const item of allItems) {
    if (item.use === undefined) {
      // #63 recovery カテゴリの道具は必ず使える（置いても使えない道具を作らない）
      if (item.category === "recovery") {
        fail("use-missing", `${item.id}: recovery なのに use 効果が無い`);
      }
      if (item.useScope !== undefined) {
        fail("use-scope", `${item.id}: use が無いのに useScope がある`);
      }
      continue;
    }
    walk(item.id, item.use);
    // #64 使える道具は使うと無くなる（持ち物と違い、使い切りでないと在庫が意味を失う）
    if (item.consumable !== true) {
      fail("use-consumable", `${item.id}: 使える道具なのに consumable でない`);
    }
  }

  // #65 ショップの品揃えが実在し、値段が付いている
  for (const shop of allShops) {
    if (shop.items.length === 0) fail("shop-empty", `${shop.id}: 品揃えが空`);
    for (const id of shop.items) {
      const item = allItems.find((i) => i.id === id);
      if (item === undefined) {
        fail("shop-ref", `${shop.id}: 存在しない道具を売っている: ${id}`);
        continue;
      }
      // 値段が無い道具を店に置くと、買えないものが棚に並ぶ
      if (item.price === undefined) {
        fail("shop-price", `${shop.id}: 値段の無い道具を売っている: ${id}`);
      }
    }
    if (new Set(shop.items).size !== shop.items.length) {
      fail("shop-dup", `${shop.id}: 同じ道具が2度並んでいる`);
    }
  }
}

/**
 * 地方の定義（v0.10）。検証項目 #70〜#72。
 */
function checkRegions(): void {
  const named = new Set(allNamed.map((n) => n.id));
  const species = new Set(allSpecies.map((s) => s.id));

  for (const region of allRegions) {
    // #70 遊べる地方は、始められるだけの情報を持つ
    if (!region.available) {
      // 未実装の地方に中途半端な定義を残さない（あるのに入れない、が一番分かりにくい）
      if (region.start !== undefined || region.challenge !== undefined) {
        fail("region", `${region.id}: available でないのに start / challenge がある`);
      }
      continue;
    }
    if (region.start === undefined) fail("region", `${region.id}: start が無い`);
    if (region.starters === undefined) fail("region", `${region.id}: starters が無い`);
    if (region.challenge === undefined) fail("region", `${region.id}: challenge が無い`);
    if (region.levelBands === undefined || region.levelBands.length === 0) {
      fail("region", `${region.id}: levelBands が無い`);
    }

    // #71 参照先が実在する
    for (const id of region.starters ?? []) {
      if (!species.has(id)) fail("region", `${region.id}: 御三家 "${id}" が無い`);
    }
    const challenge = region.challenge;
    if (challenge?.kind === "gyms") {
      for (const id of [...challenge.gyms, ...challenge.elite4, challenge.champion]) {
        if (!named.has(id)) fail("region", `${region.id}: ネームド "${id}" が無い`);
      }
    }

    // #72 レベル帯が単調（相棒のレベル同期がここを読む・regions.md §6）
    const bands = region.levelBands ?? [];
    for (const [i, band] of bands.entries()) {
      if (band.min > band.max) fail("region", `${region.id}: バッジ${band.badges} の min > max`);
      const prev = bands[i - 1];
      if (prev !== undefined && band.min < prev.min) {
        fail("region", `${region.id}: バッジ${band.badges} でレベル帯が下がっている`);
      }
    }
  }

  // #73 拠点のマップに野生は出ない（拠点は地方の外なので出現テーブルを持たない）
  for (const map of allMaps) {
    if (map.region === "hub" && map.encounters !== undefined) {
      fail("region", `${map.id}: 拠点のマップに出現テーブルがある`);
    }
  }
}

/** `UseEffect` の全種類。型から漏れると型検査が落ちる。 */
const USE_KINDS: UseEffect["kind"][] = ["heal", "healRatio", "cure", "revive", "pp", "multi"];

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
    // v0.11 で採点決着が入った。**入ったからこそ、値の方を検査する**
    if (rules.winCondition.kind === "turnLimit") {
      const { turns, judge } = rules.winCondition;
      if (turns < 1) fail("facility-judge", `${where}: ターン制限が ${turns}`);
      if (judge.criteria.length === 0) {
        fail("facility-judge", `${where}: 採点の観点が1つも無い（必ず引き分けになる）`);
      }
      for (const criterion of judge.criteria) {
        if (!(JUDGE_CRITERIA as readonly string[]).includes(criterion)) {
          fail("facility-judge", `${where}: 未知の採点の観点 ${criterion}`);
        }
      }
      if (new Set(judge.criteria).size !== judge.criteria.length) {
        fail("facility-judge", `${where}: 採点の観点が重複（2回目は必ず同点になる）`);
      }
    }

    // #76 タイプ縛りをレンタルでやると詰む（v0.11）。
    // 貸し出しの候補にそのタイプが teamSize 体入らないと、**編成が組めない**
    if (rules.requiredType !== undefined && rules.teamSource === "rental") {
      const usable = allBattleSets.filter(
        (set) =>
          set.grade === facility.rentalGrade
          && gameData.species(set.species).types.includes(rules.requiredType!),
      ).length;
      if (usable < rules.teamSize * 2) {
        fail(
          "rental-type",
          `${where}: grade ${facility.rentalGrade} の ${rules.requiredType} が ${usable} 件（編成が組めずに詰む）`,
        );
      }
    }

    // #75 交換はレンタルの施設でしか成立しない（v0.11）。
    // 自分の手持ちで挑む施設で交換すると、連れてきた個体が消える
    if (rules.swapAfterWin !== undefined && rules.teamSource !== "rental") {
      fail(
        "facility-swap",
        `${where}: teamSource が ${rules.teamSource} なのに交換がある（自分の個体が消える）`,
      );
    }
    // v0.8 で実個体が入ったので "own" が成立するようになった。
    // "hallOfFame"（殿堂入りの記録から相手を作る）は v1.0
    if (rules.teamSource === "hallOfFame") {
      fail("unimplemented-mechanic", `${where}: 殿堂入りの記録からの編成は未実装（v1.0）`);
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
    // ジムリーダーと四天王は専門タイプで定義される（§4）。
    // チャンピオンは縛りを持たない（だから最も強くなる）し、
    // 「その他」は職業や役割で定義するので、タイプが無いのが普通
    // ―― 研究者や保管庫の主に専門タイプを求める意味は無い（v0.11）
    if (
      (character.role === "gymLeader" || character.role === "elite4")
      && character.concept?.type === undefined
    ) {
      fail("named-type", `${where}: ${character.role} に専門タイプが無い`);
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
      // #10 signature が全ティアに含まれる ―― 「同じキャラだ」と認識できる最低条件。
      // **進化形でもよい**（§3.1）。イワークとハガネールは同じ「タケシのイワーク」
      const line = signatureOk ? evolutionLine(gameData, character.signature) : new Set<string>();
      if (signatureOk && !party.some((m) => line.has(m.species))) {
        fail("named-signature", `${label}: エース ${character.signature}（進化形を含む）が居ない`);
      }

      // #74 進化前と進化後を同時に出さない（§3.1）。
      // 両方居ると「どちらが核か」が消える ―― エースを不動にした意味が無くなる。
      //
      // **原作ティアは対象外。** ワタルは本当にハクリュー2匹とカイリューを出すし、
      // キクコは本当にゴーストとゲンガーを並べる。原作の再現に自分の規則を当てない
      // （持ち物の重複検査を original で外しているのと同じ理由）
      for (const m of tier === "original" ? [] : party) {
        const after = evolutionLine(gameData, m.species);
        after.delete(m.species);
        const both = party.filter((o) => after.has(o.species));
        if (both.length > 0) {
          fail(
            "named-evo-pair",
            `${label}: ${m.species} と ${both.map((o) => o.species).join(",")} が同時に居る（進化前後）`,
          );
        }
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
    if (rules.teamSource === "hallOfFame") {
      fail("unimplemented-mechanic", `${where}: 殿堂入りの記録からの編成は未実装（v1.0）`);
    }
    if (cup.rounds < 1) fail("cup-rounds", `${where}: rounds が ${cup.rounds}`);

    // #76 タイプ縛りをレンタルでやると詰む（v0.11）。
    // タイプ縛りカップは「自分で育てたそのタイプで挑む」場所にしてある
    if (rules.requiredType !== undefined && rules.teamSource === "rental") {
      for (const tier of cup.tierProgression) {
        const grade = cup.rentalGradeByTier[tier] ?? 4;
        const usable = allBattleSets.filter(
          (set) =>
            set.grade === grade
            && gameData.species(set.species).types.includes(rules.requiredType!),
        ).length;
        if (usable < rules.teamSize * 2) {
          fail(
            "rental-type",
            `${where}/${tier}: grade ${grade} の ${rules.requiredType} が ${usable} 件（編成が組めずに詰む）`,
          );
        }
      }
    }

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
        const picked = selectParty(gameData, character, party, rules.teamSize);
        if (picked.length !== Math.min(rules.teamSize, party.length)) {
          fail("cup-select", `${where}/${tier}/${character.id}: 選出が ${picked.length}体`);
        }
        const aceLine = evolutionLine(gameData, character.signature);
        if (!picked.some((m) => aceLine.has(m.species))) {
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

  // #68 与える経験値の出典（v0.9.5）。
  // v0.8 は全件が種族値合計からの推定だった。species-numbers.tsv が入って全件が実データになったが、
  // **種を足して数値の取り込みを忘れると静かに推定へ戻る**ので、ここで報告し続ける
  const guessed = allSpecies.filter(
    (s) => (s as Species & { baseExpSource?: string }).baseExpSource !== "official",
  );
  if (guessed.length > 0) {
    warn(
      "provenance",
      `${guessed.length}/${allSpecies.length} 種の与える経験値が推定値` +
        `（npm run fetch:numbers を実行）: ${guessed.slice(0, 8).map((s) => s.id).join(" ")}`,
    );
  }
}


// ─────────────────────────────────────────────
// #46〜#57 世界（マップ・イベント・フラグ）
//
// 数百マップを手で繋ぐ以上、接続ミスは必ず起きる。
// 特にフラグのタイプミスは「永久に立たないフラグ」になり、
// 発生してから原因を突き止めるのが極めて難しい。ここで潰す。
// 設計: docs/design/world.md §3・§6・§8
// ─────────────────────────────────────────────
function checkWorld(): void {
  const mapById = new Map(allMaps.map((m) => [m.id, m]));
  const eventIds = new Set(allEvents.map((e) => e.id));
  const trainerIds = new Set(allTrainers.map((t) => t.id));
  const tableIds = new Set(allEncounterTables.map((t) => t.id));
  const declaredFlags = new Set<string>(allFlags);
  const speciesIds = new Set(allSpecies.map((s) => s.id));
  const itemIds = new Set(allItems.map((i) => i.id));
  const moveIds = new Set(allMoves.map((m) => m.id));

  const abilityIds = new Set(allFieldAbilities.map((a) => a.id));

  const usedFlags = new Set<string>();
  const usedEvents = new Set<string>();
  const usedAbilities = new Set<string>();

  const at = (map: MapData, x: number, y: number) => y * map.size.width + x;
  const inside = (map: MapData, x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.size.width && y < map.size.height;

  // ── #46 マップの整合 ──
  for (const map of allMaps) {
    const cells = map.size.width * map.size.height;
    for (const [label, length] of [
      ["collision", map.collision.length],
      ["terrain", map.terrain.length],
      ["layers.ground", map.layers.ground.length],
    ] as const) {
      if (length !== cells) {
        fail("map-size", `${map.id}: ${label} の長さが ${length}（${cells} のはず）`);
      }
    }
    for (const id of map.encounters ?? []) {
      if (!tableIds.has(id)) {
        fail("map-encounters", `${map.id}: 出現テーブル "${id}" が無い`);
      }
    }
  }

  // ── #47 warp の接続 ──
  for (const map of allMaps) {
    for (const warp of map.warps) {
      const where = `${map.id} (${warp.at.x},${warp.at.y})`;
      if (!inside(map, warp.at.x, warp.at.y)) {
        fail("warp", `${where}: warp がマップの外`);
        continue;
      }
      if (map.collision[at(map, warp.at.x, warp.at.y)] === true && warp.trigger === "step") {
        fail("warp", `${where}: 踏む warp が通行不可タイルの上にある`);
      }
      const dest = mapById.get(warp.to.map);
      if (dest === undefined) {
        fail("warp", `${where}: 接続先マップ "${warp.to.map}" が無い`);
        continue;
      }
      if (!inside(dest, warp.to.x, warp.to.y)) {
        fail("warp", `${where}: 接続先 ${warp.to.map} (${warp.to.x},${warp.to.y}) が範囲外`);
        continue;
      }
      if (dest.collision[at(dest, warp.to.x, warp.to.y)] === true) {
        fail("warp", `${where}: 接続先 ${warp.to.map} (${warp.to.x},${warp.to.y}) が通行不可`);
      }
      // 「調べる」warp が歩けるマスにあると、**調べる前に踏んで通り過ぎる。**
      // 実際に v0.8 でドアがこれになっていて、家に入れなかった
      if (warp.trigger === "interact" && map.collision[at(map, warp.at.x, warp.at.y)] !== true) {
        fail(
          "warp",
          `${where}: 調べる warp が歩けるマスにある（調べる前に上に乗ってしまう）`,
        );
      }

      // 出た先に「その場で踏む warp」があると、無限に往復して操作不能になる
      const trap = dest.warps.find(
        (w) => w.trigger === "step" && w.at.x === warp.to.x && w.at.y === warp.to.y,
      );
      if (trap !== undefined) {
        fail("warp", `${where}: 接続先が踏む warp の上。無限往復になる`);
      }
    }
  }

  // ── #48 オブジェクト ──
  for (const map of allMaps) {
    const seen = new Map<string, string>();
    for (const object of map.objects) {
      const where = `${map.id}/${object.id}`;
      if (!inside(map, object.at.x, object.at.y)) {
        fail("map-object", `${where}: マップの外`);
        continue;
      }
      if (map.collision[at(map, object.at.x, object.at.y)] === true) {
        fail("map-object", `${where}: 通行不可タイルの上。話しかけられない`);
      }
      const key = `${object.at.x},${object.at.y}`;
      const other = seen.get(key);
      if (other !== undefined) {
        // 条件付きで入れ替わるものは重なってよい
        if (object.condition === undefined) {
          fail("map-object", `${where}: ${other} と同じマスに無条件で重なっている`);
        }
      } else {
        seen.set(key, object.id);
      }

      if (object.event !== undefined) {
        usedEvents.add(object.event);
        if (!eventIds.has(object.event)) {
          fail("map-object", `${where}: イベント "${object.event}" が無い`);
        }
      }
      if (object.kind.type === "obstacle") {
        const clearedBy = object.kind.clearedBy;
        if (!abilityIds.has(clearedBy)) {
          fail("field-ability", `${where}: フィールド技 "${clearedBy}" が宣言されていない`);
        }
        usedAbilities.add(clearedBy);
      }
      if (object.kind.type === "trainer") {
        const kind = object.kind;
        if (!trainerIds.has(kind.trainer)) {
          fail("map-object", `${where}: トレーナー "${kind.trainer}" が無い`);
        }
        // #77 視線に入っても、イベントが無ければ何も起きない（v0.12）。
        // 置いてあるのに戦えないトレーナーは、ただの通れないマス
        if (object.event === undefined) {
          fail("map-object", `${where}: トレーナーにイベントが無い（視線に入っても何も起きない）`);
        }
        if (kind.sight < 0 || kind.sight > 8) {
          fail("map-object", `${where}: 視線 ${kind.sight} マスは範囲外`);
        }
        // #78 撃破しても消えないと、**同じ相手と無限に戦える**。
        // 消し方は condition（撃破フラグが false のときだけ居る）
        const trainer = allTrainers.find((t) => t.id === kind.trainer);
        if (kind.sight > 0 && object.condition === undefined && trainer !== undefined) {
          fail(
            "map-object",
            `${where}: 視線があるのに条件が無い（撃破後も見つけてくる。if:${trainer.defeatedFlag}=false）`,
          );
        }
      }
      // #79 NPC が動く機構は未実装（v0.12 で「向きだけ」に決めた・world-map.md）
      if (object.kind.type === "npc" && object.kind.movement !== "static") {
        fail(
          "unimplemented-mechanic",
          `${where}: NPC の movement "${object.kind.movement}" は未実装（static のみ）`,
        );
      }
      if (object.kind.type === "item" && !itemIds.has(object.kind.item)) {
        fail("map-object", `${where}: 道具 "${object.kind.item}" が無い`);
      }
      if (object.condition !== undefined) {
        for (const flag of flagsUsedBy(object.condition)) usedFlags.add(flag);
        checkCondition(object.condition, where);
      }
      // 看板・NPCは調べるだけの存在。イベントが無いと置いた意味が無い
      if (object.event === undefined && object.kind.type !== "obstacle") {
        warn("map-object", `${where}: イベントが無い`);
      }
    }
  }

  function checkCondition(cond: Condition, where: string): void {
    for (const flag of flagsUsedBy(cond)) {
      usedFlags.add(flag);
      if (!declaredFlags.has(flag)) {
        fail("flag-declared", `${where}: フラグ "${flag}" が flags.json に無い`);
      }
    }
    if (cond.kind === "hasSpecies" && !speciesIds.has(cond.species)) {
      fail("event-ref", `${where}: 種族 "${cond.species}" が無い`);
    }
    if (cond.kind === "hasItem" && !itemIds.has(cond.item)) {
      fail("event-ref", `${where}: 道具 "${cond.item}" が無い`);
    }
    if (cond.kind === "and" || cond.kind === "or") {
      for (const c of cond.of) checkCondition(c, where);
    }
  }

  /** そのイベントがこのフラグを true にするか（v0.12-d）。 */
  function setsFlag(eventId: string, flag: string): boolean {
    const event = allEvents.find((e) => e.id === eventId);
    if (event === undefined) return false;
    return walkCommands(event.commands).some(
      (c) => c.kind === "setFlag" && c.flag === flag && c.value,
    );
  }

  /** 条件の中に出てくるフラグ（v0.12-d）。 */
  function flagsIn(cond: Condition): string[] {
    if (cond.kind === "flag") return [cond.flag];
    if (cond.kind === "and" || cond.kind === "or") return cond.of.flatMap(flagsIn);
    return [];
  }

  // ── #49〜#52 イベント ──
  for (const event of allEvents) {
    const where = event.id;
    const commands = walkCommands(event.commands);
    assertAllEventCommandsHandled(commands.map((c) => c.kind));

    for (const command of commands) {
      switch (command.kind) {
        case "setFlag":
          usedFlags.add(command.flag);
          if (!declaredFlags.has(command.flag)) {
            fail("flag-declared", `${where}: フラグ "${command.flag}" が flags.json に無い`);
          }
          break;
        case "if":
          checkCondition(command.cond, where);
          break;
        case "battle":
          if (!trainerIds.has(command.trainer)) {
            fail("event-ref", `${where}: トレーナー "${command.trainer}" が無い`);
          }
          for (const next of [command.onWin, command.onLose]) {
            if (next === undefined) continue;
            usedEvents.add(next);
            if (!eventIds.has(next)) fail("event-ref", `${where}: イベント "${next}" が無い`);
          }
          break;
        case "giveItem":
          if (!itemIds.has(command.item)) {
            fail("event-ref", `${where}: 道具 "${command.item}" が無い`);
          }
          break;
        case "givePokemon":
          if (!speciesIds.has(command.species)) {
            fail("event-ref", `${where}: 種族 "${command.species}" が無い`);
          }
          for (const move of command.moves ?? []) {
            if (!moveIds.has(move)) fail("event-ref", `${where}: 技 "${move}" が無い`);
          }
          break;
        case "warp":
          if (!mapById.has(command.to)) {
            fail("event-ref", `${where}: マップ "${command.to}" が無い`);
          }
          break;
        // ── #69 拠点から地方へ入る（v0.10）──
        case "enterRegion": {
          const region = allRegions.find((r) => r.id === command.region);
          if (region === undefined) {
            fail("event-ref", `${where}: 地方 "${command.region}" が regions.json に無い`);
            break;
          }
          // **遊べない地方へのゲートを開けない。**
          // 「じゅんびちゅう」と伝えるのはメッセージの仕事で、入口の仕事ではない
          if (!region.available) {
            fail("region", `${where}: 地方 "${command.region}" は available でない`);
          }
          if (region.start === undefined) {
            fail("region", `${where}: 地方 "${command.region}" に start が無い`);
          } else if (!mapById.has(region.start.map)) {
            fail("region", `${command.region}: start のマップ "${region.start.map}" が無い`);
          }
          break;
        }
        default:
          break;
      }
    }

    // ── #51 battle は末尾にしか書けない（world.md §6）──
    // インラインの続きを許すと「バトルを含むイベントの途中状態」が生まれ、
    // セーブできない領域がゲーム内にできてしまう
    checkBattleIsTail(event.commands, true, where);
  }

  function checkBattleIsTail(list: readonly EventCommand[], tail: boolean, where: string): void {
    list.forEach((command, i) => {
      const last = i === list.length - 1;
      if (command.kind === "battle" && !(tail && last)) {
        fail("event-battle-tail", `${where}: battle の後ろにコマンドが続いている`);
      }
      if (command.kind === "if") {
        checkBattleIsTail(command.then, tail && last, where);
        checkBattleIsTail(command.else ?? [], tail && last, where);
      }
      if (command.kind === "choice") {
        for (const option of command.options) {
          checkBattleIsTail(option.then, tail && last, where);
        }
      }
    });
  }

  // ── #53 トレーナー ──
  for (const trainer of allTrainers) {
    if (!declaredFlags.has(trainer.defeatedFlag)) {
      fail("flag-declared", `${trainer.id}: フラグ "${trainer.defeatedFlag}" が flags.json に無い`);
    }
    usedFlags.add(trainer.defeatedFlag);
    if (trainer.party.length === 0) fail("trainer", `${trainer.id}: 手持ちが空`);
    for (const member of trainer.party) {
      if (!speciesIds.has(member.species)) {
        fail("trainer", `${trainer.id}: 種族 "${member.species}" が無い`);
        continue;
      }
      if (member.moves.length === 0) {
        fail("trainer", `${trainer.id}: ${member.species} の技が空。わるあがきしかできない`);
      }
      for (const move of member.moves) {
        if (!moveIds.has(move)) fail("trainer", `${trainer.id}: 技 "${move}" が無い`);
      }
    }
  }

  // ── #54 出現テーブル ──
  for (const table of allEncounterTables) {
    if (table.entries.length === 0) {
      fail("encounter", `${table.id}: 中身が空。エンカウントが成立しても何も出ない`);
    }
    const total = table.entries.reduce((n, e) => n + e.rate, 0);
    if (total <= 0) fail("encounter", `${table.id}: rate の合計が 0`);
    for (const entry of table.entries) {
      if (!speciesIds.has(entry.species)) {
        fail("encounter", `${table.id}: 種族 "${entry.species}" が無い`);
      }
      const [lo, hi] = entry.levelRange;
      if (lo > hi) fail("encounter", `${table.id}: ${entry.species} の levelRange が逆`);
      if (lo < 1) fail("encounter", `${table.id}: ${entry.species} の下限が ${lo}`);
    }
  }

  // ── #55・#56 到達不能な区画と、話しかけられないオブジェクト ──
  for (const map of allMaps) checkReachability(map, mapById);

  // ── #81 マップに入った瞬間のイベント（v0.12-d）──
  for (const map of allMaps) {
    if (map.onEnter === undefined) continue;
    usedEvents.add(map.onEnter);
    if (!eventIds.has(map.onEnter)) {
      fail("map-on-enter", `${map.id}: onEnter のイベント "${map.onEnter}" が無い`);
    }
  }

  // ── #82 そらをとぶ の行き先（v0.12-d）──
  //
  // **「立てる場所か」と「来たら開くか」を両方見る。**
  // 座標だけ見ていると、壁の中へ飛ばす行き先を作れてしまう。
  // 記録するフラグだけ見ていると、行き先に宣言したのに永久に開かないマップができる。
  for (const map of allMaps) {
    const point = map.flyPoint;
    if (point === undefined) continue;
    const where = `${map.id} そらをとぶ`;
    if (!inside(map, point.x, point.y) || map.collision[at(map, point.x, point.y)] === true) {
      fail("fly-point", `${where}: (${point.x},${point.y}) に立てない`);
    } else if (map.objects.some((o) => o.at.x === point.x && o.at.y === point.y)) {
      fail("fly-point", `${where}: (${point.x},${point.y}) に何か置いてある`);
    }
    usedFlags.add(point.flag);
    if (!declaredFlags.has(point.flag)) {
      fail("fly-point", `${where}: フラグ "${point.flag}" が flags.json に無い`);
    }
    if (map.onEnter === undefined || !setsFlag(map.onEnter, point.flag)) {
      fail("fly-point", `${where}: 来ても "${point.flag}" が立たない（onEnter で立てる約束）`);
    }
  }

  // ── #83 フィールド技の解放条件（v0.12-d）──
  for (const ability of allFieldAbilities) {
    for (const flag of flagsIn(ability.requires)) {
      usedFlags.add(flag);
      if (!declaredFlags.has(flag)) {
        fail("field-ability", `${ability.id}: フラグ "${flag}" が flags.json に無い`);
      } else if (!allEvents.some((e) => setsFlag(e.id, flag))) {
        fail("field-ability", `${ability.id}: "${flag}" を立てるイベントが無い（永久に使えない）`);
      }
    }
  }

  // ── #84 障害物として使われている技は、実際に手に入るか（v0.12-d）──
  //
  // 置いた岩をどける手段が世界のどこにも無ければ、その先は永久に閉じている。
  // #80 は地形として繋がっているかしか見ないので、ここで別に見る。
  for (const id of usedAbilities) {
    const ability = allFieldAbilities.find((a) => a.id === id);
    if (ability === undefined) continue;
    if (flagsIn(ability.requires).length === 0) {
      warn("field-ability", `${id}: 解放条件にフラグが無い（バッジだけで開く）`);
    }
  }

  // ── #80 地方の入口から、その地方の全マップに歩いて行けること（v0.12-b）──
  checkRegionConnectivity();

  // ── #57・#58 使われていない宣言（警告）──
  for (const flag of declaredFlags) {
    if (!usedFlags.has(flag)) warn("flag-unused", `フラグ "${flag}" を誰も使っていない`);
  }
  for (const event of allEvents) {
    if (!usedEvents.has(event.id)) warn("event-unused", `イベント "${event.id}" を誰も呼ばない`);
  }
}

/**
 * 地方まるごとの到達可能性（v0.12-b）。
 *
 * #55 は**1枚のマップの中**しか見ていなかった。
 * おつきみやまを足したとき、7行目の壁が右まで届いていて
 * **南半分が丸ごと切れていた**が、そこは「到達できないマス」ではなく
 * 「行き止まりだが繋がっている区画」だったので #55 を素通りした。
 * 気づいたのは、台本が「経路なし」と言ったときだった。
 *
 * ここでは地方の入口（`regions.json` の `start`）から踏む warp を辿り、
 * **その地方のマップに1枚も取り残しが無いこと**を見る。
 */
function checkRegionConnectivity(): void {
  const byId = new Map(allMaps.map((m) => [m.id, m]));
  const mapOf = (id: string): MapData => {
    const found = byId.get(id);
    if (found === undefined) throw new Error(`マップ ${id} が無い`);
    return found;
  };

  for (const region of allRegions) {
    if (region.start === undefined) continue;
    const inRegion = allMaps.filter((m) => m.region === region.id);
    const key = (map: string, x: number, y: number) => `${map}|${x},${y}`;

    const seen = new Set<string>([key(region.start.map, region.start.x, region.start.y)]);
    const reached = new Set<string>();
    const queue = [{ map: region.start.map, x: region.start.x, y: region.start.y }];

    while (queue.length > 0) {
      const here = queue.shift()!;
      reached.add(here.map);
      const map = mapOf(here.map);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        let nx = here.x + dx;
        let ny = here.y + dy;
        if (nx < 0 || ny < 0 || nx >= map.size.width || ny >= map.size.height) continue;
        // 段差は下方向にしか越えられない
        if (map.terrain[ny * map.size.width + nx] === "ledge") {
          if (dy !== 1) continue;
          nx += dx;
          ny += dy;
          if (nx < 0 || ny < 0 || nx >= map.size.width || ny >= map.size.height) continue;
        }
        // 水は なみのり で越えられる（v0.12-d）。
        // **ここは「地形として繋がっているか」を見る場所**であって、
        // 「今の進行度で行けるか」ではない。能力の入手順は #84 が別に見る
        if (
          map.collision[ny * map.size.width + nx] === true &&
          map.terrain[ny * map.size.width + nx] !== "water"
        ) {
          continue;
        }
        // **条件つきのオブジェクトは塞いでいないものとして扱う。**
        // 進行で消えるものを壁として数えると、開通済みの道まで閉じてしまう。
        // 障害物も同じ（どければ通れる・v0.12-d）
        if (
          map.objects.some(
            (o: MapObject) =>
              o.at.x === nx &&
              o.at.y === ny &&
              o.kind.type !== "item" &&
              o.kind.type !== "obstacle" &&
              o.condition === undefined,
          )
        ) {
          continue;
        }
        const warp = map.warps.find(
          (w: Warp) => w.at.x === nx && w.at.y === ny && w.trigger === "step",
        );
        const next = warp === undefined
          ? { map: here.map, x: nx, y: ny }
          : { map: warp.to.map, x: warp.to.x, y: warp.to.y };
        const id = key(next.map, next.x, next.y);
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(next);
      }
    }

    for (const map of inRegion) {
      if (!reached.has(map.id)) {
        fail(
          "region-connectivity",
          `${region.id}: ${map.id} へ ${region.start.map} から歩いて行けない`,
        );
      }
    }
  }
}

/**
 * 塗りつぶしでマップ内の到達不能な区画を探す。
 *
 * 段差は一方通行なので、辺を張るときに向きを見る。
 * 「入れるが出られない区画」は、この向きを無視すると見逃す。
 */
function checkReachability(map: MapData, mapById: ReadonlyMap<string, MapData>): void {
  const { width, height } = map.size;
  const at = (x: number, y: number) => y * width + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;

  // 条件付きオブジェクトは消えうるので、塞いでいるとは見なさない。
  // **障害物も塞いでいない扱い**（v0.12-d）―― どければ通れるので、
  // ここで壁と見なすと「いあいぎりの先に置いた道具」が全部エラーになる。
  const blockedByObject = new Set(
    map.objects
      .filter(
        (o) => o.condition === undefined && o.kind.type !== "item" && o.kind.type !== "obstacle",
      )
      .map((o) => at(o.at.x, o.at.y)),
  );
  // 水は通行不可のままだが、**なみのり で越えられる**ので床として数える（v0.12-d）。
  // 数えないと、海の向こうの砂州が「到達できないマス」に見える。
  const standable = (x: number, y: number) =>
    inside(x, y) &&
    (map.collision[at(x, y)] !== true || map.terrain[at(x, y)] === "water") &&
    map.terrain[at(x, y)] !== "ledge" &&
    !blockedByObject.has(at(x, y));

  const seeds: number[] = [];
  for (const source of mapById.values()) {
    for (const warp of source.warps) {
      if (warp.to.map === map.id && standable(warp.to.x, warp.to.y)) {
        seeds.push(at(warp.to.x, warp.to.y));
      }
    }
  }
  if (seeds.length === 0) {
    warn("map-reachability", `${map.id}: どこからも入ってこられない`);
    return;
  }

  const seen = new Set(seeds);
  const stack = [...seeds];
  const steps = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const { dx, dy } of steps) {
      let nx = x + dx;
      let ny = y + dy;
      // 段差は下向きにだけ飛び降りられる。着地は2マス先
      if (inside(nx, ny) && map.terrain[at(nx, ny)] === "ledge") {
        if (dy !== 1) continue;
        nx += dx;
        ny += dy;
      }
      if (!standable(nx, ny) || seen.has(at(nx, ny))) continue;
      seen.add(at(nx, ny));
      stack.push(at(nx, ny));
    }
  }

  const orphans: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (standable(x, y) && !seen.has(at(x, y))) orphans.push(`(${x},${y})`);
    }
  }
  if (orphans.length > 0) {
    fail(
      "map-reachability",
      `${map.id}: 到達できないマスが ${orphans.length} 個 ${orphans.slice(0, 8).join(" ")}` +
        (orphans.length > 8 ? " …" : ""),
    );
  }

  // ── #56 話しかけられないオブジェクト ──
  //
  // 「マスは全部歩ける」だけでは足りない。
  // 家具に囲まれたNPCは、置いてあるのに一生喋らない ―― 到達不能な床より気づきにくい。
  for (const object of map.objects) {
    if (object.event === undefined) continue;
    const sides = [
      { x: object.at.x, y: object.at.y - 1 },
      { x: object.at.x, y: object.at.y + 1 },
      { x: object.at.x - 1, y: object.at.y },
      { x: object.at.x + 1, y: object.at.y },
    ];
    // 落ちている道具は踏んで起動するので、そのマス自体に立てればよい
    const spots =
      object.kind.type === "item" ? [object.at, ...sides] : sides;
    if (!spots.some((s) => inside(s.x, s.y) && seen.has(at(s.x, s.y)))) {
      fail(
        "map-object-reach",
        `${map.id}/${object.id}: 隣に立てるマスが無い。置いてあるが起動できない`,
      );
    }
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
  checkUseEffects();
  checkRegions();
  checkEndgame();
  checkNamed();
  checkTournaments();
  checkWorld();
  reportProvenance();

  const errors = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");

  console.log(
    `検証対象: 種族 ${allSpecies.length} / 技 ${allMoves.length} / ` +
      `特性 ${allAbilities.length} / 道具 ${allItems.length} / ` +
      `BattleSet ${allBattleSets.length} / 施設 ${allFacilities.length} / ` +
      `ネームド ${allNamed.length} / カップ ${allTournaments.length} / ` +
      `マップ ${allMaps.length} / イベント ${allEvents.length} / ` +
      `トレーナー ${allTrainers.length} / フラグ ${allFlags.length}`,
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
