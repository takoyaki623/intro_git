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
  useHandlers,
  fieldActions,
  REBUILDS_INSTANCE,
  assertAllEventCommandsHandled,
  flagsUsedBy,
  evolutionLine,
  emptyWorldState,
  canEnter,
  inBounds,
  neighborsOf,
  pushableDirections,
  walkableTerrains,
  terrainAt,
  FIELD_ABILITIES,
  METHOD_BY_TERRAIN,
  JUDGE_CRITERIA,
  selectParty,
  walkCommands,
  type Condition,
  type EventCommand,
  type FieldAbilityId,
  type HeldEffect,
  type MapData,
  type MapObject,
  type Warp,
  type WorldState,
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
  allArt,
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
    // #95 わざマシンが教える技が実在し、覚えられる種が1種以上いる（v1.1-b）
    //
    // **番号と技の対応は取り込みなので間違えない。** 危ないのはその先で、
    // 誰も覚えられない技のマシンは「置いてあるが一生使えない道具」になる。
    // 互換表（Species.tmMoves）も公式データなので、食い違ったらどちらかの
    // 取り込みが壊れている
    if (effect.kind === "teachMove") {
      if (!allMoves.some((m) => m.id === effect.move)) {
        fail("tm-move", `${id}: 教える技 "${effect.move}" が moves.json に無い`);
      } else if (!allSpecies.some((sp) => sp.tmMoves.includes(effect.move))) {
        fail("tm-move", `${id}: "${effect.move}" を おぼえられる種が1種もいない`);
      }
    }
    // #96 進化の道具が、実際にどれかの枝の鍵になっている（v1.1-b）
    //
    // 石を1つ足して**どの種にも効かない**のは、置き場所を間違えたか
    // 綴りを間違えたかのどちらか ―― 使っても「こうかが なかった」しか出ない
    if (effect.kind === "evolveByItem") {
      const branches = allSpecies.flatMap((sp) => sp.evolutions);
      const used =
        effect.via === "item"
          ? branches.some((e) => e.kind === "useItem" && e.item === id)
          : branches.some((e) => e.kind === "trade");
      if (!used) fail("evolve-item", `${id}: この道具で進化する種が1種もいない`);
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
    // #94 個体を作り替える道具は、バトル中に使えないと宣言している（v1.1-b）
    //
    // `BattlePokemon` は種族と技を戦闘開始時に固めているので、
    // わざマシンや進化の石をバトル中に通すと**画面と中身が食い違う。**
    // 実装（`useOnBattle`）も断るが、**断られるのと出てこないのは別**
    // ―― 出てくるボタンを押して断られるのは、書き忘れの現れ方の1つ
    if (REBUILDS_INSTANCE.has(item.use.kind) && item.useScope !== "field") {
      fail(
        "use-scope",
        `${item.id}: 個体を作り替える道具（${item.use.kind}）なのに scope が "${item.useScope ?? "both"}"`,
      );
    }

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
/**
 * 「つかう」効果の一覧。
 *
 * **レジストリから導く**（v1.1-b）。v0.9 からここは手書きの写しで、
 * `use-item.ts` に効果を足すたびに2箇所を直す必要があった ――
 * 技効果（`effectHandlers`）・持ち物（`heldHandlers`）はとっくに
 * レジストリを直接見ているのに、ここだけ写しが残っていた。
 */
const USE_KINDS: UseEffect["kind"][] = Object.keys(useHandlers) as UseEffect["kind"][];

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
        fail("unimplemented-mechanic", `${where}: AI smart は未実装（v1.2）`);
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
        fail("unimplemented-mechanic", `${where}: 極ティアは AI smart と同時（v1.2）`);
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
/**
 * 姿のレシピ（v0.12.5・#87〜#89）。
 *
 * **描けない種が1匹でもあると、その種だけ丸に戻る。**
 * 遊んでいて気づくのは、その種に出会ったときだけなので、ここで数える。
 */
/**
 * 描ける体型と飾り。
 *
 * **`tools/import.ts` と同じ一覧をここでも持つ。** 共有したくなるが、
 * `validate` は生成物（JSON）だけを見るという約束を崩したくない ――
 * ずれたら #89 が落ちるので、ずれたまま進むことはない。
 */
const SHAPE_NAMES = [
  "ball", "squiggle", "fish", "arms", "blob", "upright", "legs",
  "quadruped", "wings", "tentacles", "heads", "humanoid", "bug-wings", "armor",
];
const SIZE_NAMES = ["tiny", "small", "medium", "large"];
const PART_NAMES = [
  "flame", "plant", "fin", "spark", "crystal", "drip", "aura",
  "horn", "spike", "plate", "antenna", "wing", "band", "sparkle",
];

function checkArt(): void {
  const drawn = new Set(allArt.map((a) => a.species));
  const speciesIds = new Set(allSpecies.map((s) => s.id));

  // #87 全種にレシピがある
  for (const s of allSpecies) {
    if (!drawn.has(s.id)) fail("art", `${s.id}: 姿のレシピが無い`);
  }
  // #88 居ない種のレシピを持っていない（種を消したときに残る）
  for (const a of allArt) {
    if (!speciesIds.has(a.species)) fail("art", `art.tsv: 居ない種 "${a.species}" のレシピがある`);
  }
  // #89 体型・飾りが描ける種類か
  for (const a of allArt) {
    if (!SHAPE_NAMES.includes(a.shape)) fail("art", `${a.species}: 描けない体型 "${a.shape}"`);
    if (!SIZE_NAMES.includes(a.size)) fail("art", `${a.species}: 描けない大きさ "${a.size}"`);
    for (const part of a.parts) {
      if (!PART_NAMES.includes(part)) fail("art", `${a.species}: 描けない飾り "${part}"`);
    }
  }

  // **同じ見た目になる種がどれだけ居るか**を数える（警告）。
  // シルエットを描き分けるのが目的なので、被りの多さはそのまま出来の指標になる
  const key = (a: (typeof allArt)[number]) =>
    `${a.shape}/${a.color}/${a.size}/${[...a.parts].sort().join(",")}`;
  const groups = new Map<string, string[]>();
  for (const a of allArt) groups.set(key(a), [...(groups.get(key(a)) ?? []), a.species]);
  const collided = [...groups.values()].filter((g) => g.length > 1);
  const worst = collided.sort((a, b) => b.length - a.length)[0];
  if (collided.length > 0) {
    warn(
      "art-collision",
      `見た目が同じ組み合わせが ${collided.length} 組（最大 ${worst!.length} 種: ${worst!.slice(0, 6).join(" ")}）`,
    );
  }
}

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
      // 看板・NPCは調べるだけの存在。イベントが無いと置いた意味が無い。
      // 障害物と押せる岩は**そこに在ること自体が仕事**なので黙っている
      // （スイッチは違う ―― 押しても何も起きないなら置いた意味が無いので、下の #104 が見る）
      const SILENT = new Set(["obstacle", "boulder"]);
      if (object.event === undefined && !SILENT.has(object.kind.type)) {
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

  // ── #86 warp のマスを、消えないオブジェクトで塞いでいないこと（v0.12-f）──
  //
  // 条件つきなら「勝つまで開かない扉」として正しい使い方（四天王の部屋）。
  // **条件が無いと、その出入口は永久に死んでいる。**
  for (const map of allMaps) {
    for (const warp of map.warps) {
      if (warp.trigger !== "step") continue;
      const blocker = map.objects.find(
        (o) =>
          o.at.x === warp.at.x &&
          o.at.y === warp.at.y &&
          o.kind.type !== "item" &&
          o.condition === undefined,
      );
      if (blocker !== undefined) {
        fail(
          "warp-blocked",
          `${map.id} (${warp.at.x},${warp.at.y}): 出入口に "${blocker.id}" が無条件で乗っている`,
        );
      }
    }
  }

  // ── #85 warp の往復がずれていないこと（v0.12-e）──
  //
  // **入って出たら、入口の前に立っている。** これが崩れていても
  // 「歩けないマス」でも「繋がっていない」でもないので、#47 も #80 も通る。
  // 実際 v0.12-c の4つの町で、ポケモンセンターを出ると
  // **町の反対側に飛ばされていた**（原本を写して座標だけ直し忘れた）。
  for (const map of allMaps) {
    for (const warp of map.warps) {
      const target = mapById.get(warp.to.map);
      if (target === undefined) continue;
      const back = target.warps.filter((w) => w.to.map === map.id);
      // 出入口が複数ある建物では「どの口の対か」が決まらないので見ない
      if (back.length !== 1) continue;
      const landing = back[0]!.to;
      const away = Math.abs(landing.x - warp.at.x) + Math.abs(landing.y - warp.at.y);
      if (away > 1) {
        fail(
          "warp-roundtrip",
          `${map.id} (${warp.at.x},${warp.at.y}) → ${target.id} から戻ると ` +
            `(${landing.x},${landing.y})＝${away}マス離れた場所に出る`,
        );
      }
    }
  }

  // ── #90・#91 殿堂入り（v1.0）──
  //
  // **地方は「終われる」ようになっていて初めて地方になる。**
  // 遊べる地方を足したのに終点を書き忘れると、8つ目のバッジのあとに何も無い ――
  // 遊んで気づくには、いちばん遠い場所にある間違いになる。
  {
    const runs = (kind: string) =>
      allEvents.filter((e) => walkCommands(e.commands).some((c) => c.kind === kind));
    for (const region of allRegions) {
      if (!region.available) continue;
      // イベントIDは地方ごとに接頭辞をつける約束（world.md §6）
      const ending = runs("hallOfFame").filter((e) => e.id.startsWith(`${region.id}.`));
      if (ending.length === 0) {
        fail("hall-of-fame", `${region.id}: 殿堂入りするイベントが無い（終われない地方）`);
      }
    }
    if (runs("openHall").length === 0) {
      warn("hall-of-fame", "殿堂の記録を見られる場所がどこにも無い");
    }
  }

  // ── #98〜#102 フィールド行動（v1.1-c）──
  {
    /** `Condition` が要求している道具（`hasItem` を掘る）。 */
    const itemsUsedBy = (cond: Condition): string[] => {
      if (cond.kind === "hasItem") return [cond.item];
      if (cond.kind === "and" || cond.kind === "or") return cond.of.flatMap(itemsUsedBy);
      return [];
    };
    /** 世界のどこかで配られる道具（ショップ・イベント）。 */
    const givenItems = new Set<string>();
    for (const shop of allShops) for (const item of shop.items) givenItems.add(item);
    for (const event of allEvents) {
      for (const c of walkCommands(event.commands)) {
        if (c.kind === "giveItem") givenItems.add(c.item);
      }
    }

    // #98 全 FieldEffect.kind にハンドラがある（#21・#24・#61・#94 と同型）
    for (const kind of Object.keys(fieldActions)) {
      if (fieldActions[kind as keyof typeof fieldActions] === undefined) {
        fail("field-effect", `フィールド行動 "${kind}" に処理が無い`);
      }
    }
    for (const ability of allFieldAbilities) {
      const effect = ability.effect;
      if (effect === undefined) continue;
      if (!(effect.kind in fieldActions)) {
        fail("field-effect", `${ability.id}: 未知のフィールド行動 "${effect.kind}"`);
      }
    }

    /** その方式の表を持つマップ。 */
    const mapsWith = (method: string) =>
      allMaps.filter((m) =>
        (m.encounters ?? []).some(
          (id) => allEncounterTables.find((t) => t.id === id)?.method === method,
        ),
      );

    for (const ability of allFieldAbilities) {
      const effect = ability.effect;
      if (effect === undefined) continue;

      // #99 釣りの方式ごとに、その表を持つマップが1枚以上ある
      //     ―― さおを配ったのに一生かからない、を止める
      if (effect.kind === "fish" && mapsWith(effect.method).length === 0) {
        fail("field-effect", `${ability.id}: "${effect.method}" の表を持つマップが1枚も無い`);
      }

      // #100 いわくだき の野生は、割れる岩のあるマップに表がある
      if (effect.kind === "clear" && effect.then !== undefined) {
        const withRock = allMaps.filter((m) =>
          m.objects.some((o) => o.kind.type === "obstacle" && o.kind.clearedBy === ability.id),
        );
        const withTable = new Set(mapsWith(effect.then.method).map((m) => m.id));
        if (withRock.length > 0 && !withRock.some((m) => withTable.has(m.id))) {
          warn(
            "field-effect",
            `${ability.id}: 割れる岩が ${withRock.length} 個あるが、` +
              `"${effect.then.method}" の表を持つマップが1枚も無い（原作の該当地はまだ作っていない）`,
          );
        }
      }
    }

    // #101 隠しアイテムがあるなら、探す能力を解放するイベントがある
    const buried = allMaps.flatMap((m) =>
      m.objects.filter((o) => o.kind.type === "item" && o.kind.hidden).map((o) => `${m.id}/${o.id}`),
    );
    if (buried.length > 0) {
      const finders = allFieldAbilities.filter((a) => a.effect?.kind === "reveal");
      if (finders.length === 0) {
        fail("field-effect", `隠しアイテムが ${buried.length} 個あるが、探す能力が1つも無い`);
      }
      for (const finder of finders) {
        // 解放条件が要求する道具・フラグが、どこかで手に入るか
        for (const item of itemsUsedBy(finder.requires)) {
          if (!givenItems.has(item)) {
            fail("field-effect", `${finder.id}: 要る道具 "${item}" が世界のどこでも手に入らない`);
          }
        }
      }
    }

    // #102 さおも同じ ―― 能力の鍵になる道具は必ず配られている
    for (const ability of allFieldAbilities) {
      for (const item of itemsUsedBy(ability.requires)) {
        if (!givenItems.has(item)) {
          fail("field-ability", `${ability.id}: 要る道具 "${item}" が世界のどこでも手に入らない`);
        }
      }
    }
  }

  // ── #103〜#106 押せる岩とスイッチ（v1.1-f）──
  //
  // **岩は「置いた」だけでは仕掛けにならない。** v1.1-e で1階の
  // かいりき の岩が迷路の輪に迂回されていたのと同じで、動かせない岩・
  // 何も起こさないスイッチは、ただの通れないマスにしかならない。
  {
    const boulders = allMaps.flatMap((m) =>
      m.objects
        .filter((o) => o.kind.type === "boulder")
        .map((o) => ({ map: m, object: o, pushedBy: (o.kind as { pushedBy: string }).pushedBy })),
    );
    const switches = allMaps.flatMap((m) =>
      m.objects.filter((o) => o.kind.type === "switch").map((o) => ({ map: m, object: o })),
    );

    for (const { map, object, pushedBy } of boulders) {
      const where = `${map.id}/${object.id}`;

      // #103 初期位置から最低1方向へ押せる（判定は `core` の関数をそのまま呼ぶ ――
      //      ここで書き直すと、検証だけが通る岩ができる）
      const dirs = pushableDirections(map, ABLE, object, pushedBy as FieldAbilityId);
      if (dirs.length === 0) {
        fail("boulder", `${where}: どの向きにも押せない（ただの通れないマス）`);
      }

      // #104 岩の初期位置にスイッチを置かない ―― 最初から押されている
      if (map.objects.some((o) => o.kind.type === "switch" && sameSpot(o, object))) {
        fail("boulder", `${where}: 最初からスイッチの上に乗っている`);
      }

      // #105 踏む warp の上に置かない ―― その出入口が永久に使えなくなる
      if (map.warps.some((w) => w.trigger === "step" && sameSpot({ at: w.at }, object))) {
        fail("boulder", `${where}: 踏む warp の上。その出入口へ入れなくなる`);
      }
    }

    for (const { map, object } of switches) {
      const where = `${map.id}/${object.id}`;

      // #106 スイッチは押されたら必ず何かする。中身がフラグを立てることまで見る ――
      //      「イベントはあるが setFlag が無い」スイッチは押しても世界が変わらない
      const event = allEvents.find((e) => e.id === object.event);
      if (object.event === undefined || event === undefined) {
        fail("switch", `${where}: イベントが無い（乗せても何も起きない）`);
        continue;
      }
      if (![...walkCommands(event.commands)].some((c) => c.kind === "setFlag")) {
        fail("switch", `${where}: イベントがフラグを立てない（乗せても世界が変わらない）`);
      }
      // 乗せる岩が同じマップに無いと、押しに行く相手が居ない
      if (!boulders.some((b) => b.map.id === map.id)) {
        fail("switch", `${where}: 同じマップに押せる岩が無い`);
      }
    }
  }

  // ── #97 バッジをくれるイベントは わざマシンもくれる（v1.1-b）──
  //
  // 原作では**どの世代でも、ジムリーダーはバッジと一緒にわざマシンを渡す。**
  // 8人ぶん手で書けば、いつか1人だけ書き忘れる（#92 と同じ形の間違い）。
  // バッジという目印があるので、機械が数えられる。
  {
    const tmIds = new Set(allItems.filter((i) => i.category === "tm").map((i) => i.id));
    for (const event of allEvents) {
      const commands = walkCommands(event.commands);
      if (!commands.some((c) => c.kind === "giveBadge")) continue;
      const given = commands.filter(
        (c) => c.kind === "giveItem" && tmIds.has(c.item),
      );
      if (given.length === 0) {
        fail("gym-tm", `${event.id}: バッジを渡すのに わざマシンを渡していない`);
      }
    }
  }

  // ── #92 同じ品揃えは同じ条件で開く（v1.1-a）──
  //
  // 町のフレンドリィショップは6軒とも同じ命令の木を持っている。
  // **同じものを6回書けば、いつか1回だけ違う形で書く。**
  // 実際グレンじまだけ `if` が抜けていて、バッジ0個でも
  // バッジ4つぶんの品揃えが開いていた ―― 遊んでも気づけない種類の間違いで、
  // 気づけるのは「6軒を並べて見比べたとき」だけ。だから機械に見比べさせる。
  //
  // 見るのは「その `shop` に辿り着くまでに通った `if` の条件」。
  // 文面や順番が違うのは構わないが、**開く条件が違うなら理由が要る。**
  {
    /** その命令に辿り着くまでの条件を、通った順に集める。 */
    const gates = new Map<string, Set<string>>();
    const walk = (commands: readonly EventCommand[], guard: string[]): void => {
      for (const c of commands) {
        if (c.kind === "shop") {
          const key = c.inventory;
          if (!gates.has(key)) gates.set(key, new Set());
          gates.get(key)!.add(JSON.stringify([...guard].sort()));
        }
        if (c.kind === "if") {
          walk(c.then, [...guard, JSON.stringify(c.cond)]);
          walk(c.else ?? [], [...guard, `!${JSON.stringify(c.cond)}`]);
        }
        if (c.kind === "choice") {
          for (const option of c.options) walk(option.then, guard);
        }
      }
    };
    for (const event of allEvents) walk(event.commands, []);

    for (const [inventory, conditions] of gates) {
      if (conditions.size <= 1) continue;
      fail(
        "shop-gate",
        `品揃え "${inventory}" を開く条件が ${conditions.size} 通りある。` +
          `どれかが書き忘れの可能性が高い`,
      );
    }
  }

  // ── #93 まだ引く手段の無い出現表（v1.1-a・警告）──
  //
  // 出現表は公式データからの取り込みなので、**釣り3段と いわくだき の表が
  // 実装より先に揃う。** これは入れ忘れではなく順序（種→表→機構）の結果だが、
  // 黙って置いておくと「引けないのか、引く処理を書き忘れたのか」が
  // 区別できなくなる。警告として毎回名乗らせ、v1.1-c で消えるようにする。
  {
    // 引ける方式は2つの出どころから来る（v1.1-c）:
    //   歩いたとき  … `METHOD_BY_TERRAIN`（地形が決める）
    //   調べたとき  … フィールド行動（さお・いわくだき）
    // **どちらか片方だけ見ていると、釣りを実装しても警告が消えない。**
    const drawable = new Set<string>(Object.values(METHOD_BY_TERRAIN));
    for (const ability of allFieldAbilities) {
      const effect = ability.effect;
      if (effect === undefined) continue;
      if (effect.kind === "fish") drawable.add(effect.method);
      if (effect.kind === "clear" && effect.then !== undefined) drawable.add(effect.then.method);
    }
    const waiting = new Map<string, number>();
    for (const map of allMaps) {
      for (const id of map.encounters ?? []) {
        const table = allEncounterTables.find((t) => t.id === id);
        if (table === undefined || drawable.has(table.method)) continue;
        waiting.set(table.method, (waiting.get(table.method) ?? 0) + 1);
      }
    }
    if (waiting.size > 0) {
      warn(
        "encounter-method",
        `まだ引く手段の無い出現表: ${[...waiting].sort().map(([m, n]) => `${m} ${n}表`).join(" / ")}`,
      );
    }
  }

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
 * 検証が使う「見立て」（v1.1-a）。
 *
 * 検証が見るのは **地形として繋がっているか**であって、
 * 「今の進行度で行けるか」ではない ―― 能力の入手順は #84 が別に見る。
 * だからフィールド技は全部持っている扱いにし、進行で消えるもの・
 * どけられるものは壁として数えない。
 */
/** 同じマスか。岩・スイッチ・warp を突き合わせるのに使う（v1.1-f）。 */
const sameSpot = (a: { at: { x: number; y: number } }, b: { at: { x: number; y: number } }): boolean =>
  a.at.x === b.at.x && a.at.y === b.at.y;

const ABLE: WorldState = {
  ...emptyWorldState(),
  abilities: [...FIELD_ABILITIES],
  // **`walkable` も入れる。** 派生値を片方だけ入れると
  // 「なみのり は使えるのに水に入れない」世界になる（v1.1-c で実際にそうなった）
  walkable: walkableTerrains(allFieldAbilities, [...FIELD_ABILITIES]),
};
// 押せる岩も「原理的には どかせる」側（v1.1-f）。壁として数えると、
// 岩の向こうにしか無い部屋を「到達できない」と誤報する ―― #55 が
// v0.12-d で障害物を壁と数えて2回誤報したのと同じ形
const IN_PRINCIPLE = {
  ignoreConditional: true,
  ignoreObstacles: true,
  ignorePushable: true,
} as const;

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
      for (const next of neighborsOf(map, ABLE, here.x, here.y, IN_PRINCIPLE, byId)) {
        const id = key(next.map, next.x, next.y);
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push({ map: next.map, x: next.x, y: next.y });
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

  // 立てるマス。「入れるマス」から段差を除いたもの ―― 段差は飛び越える対象で、
  // そこに留まることはできない。入れるかどうかの判定そのものは core に置いてある
  // （条件つきオブジェクト・障害物・なみのり の扱いはこの1箇所で決まる）
  const standable = (x: number, y: number) =>
    canEnter(map, ABLE, x, y, IN_PRINCIPLE) && terrainAt(map, x, y) !== "ledge";

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
  // **warp は辿らない。** ここは1枚の中の塗りつぶしで、
  // 「入れるが出られない区画」を探している
  const inMap = { ...IN_PRINCIPLE, followWarps: false } as const;
  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const next of neighborsOf(map, ABLE, x, y, inMap)) {
      if (!standable(next.x, next.y) || seen.has(at(next.x, next.y))) continue;
      seen.add(at(next.x, next.y));
      stack.push(at(next.x, next.y));
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
    if (!spots.some((s) => inBounds(map, s.x, s.y) && seen.has(at(s.x, s.y)))) {
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
  checkArt();
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
