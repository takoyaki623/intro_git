/**
 * 基本型。
 *
 * v0.5 で特性・持ち物が入った。天候・フィールドは未実装（v1.2）。
 * 型の側だけ先に用意しておくものは、その旨をコメントで示す。
 * 設計: docs/design/battle-system.md
 */

export const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic", "bug",
  "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;
export type Type = (typeof TYPES)[number];

export const STATS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
export type StatId = (typeof STATS)[number];
export type StatSpread = Record<StatId, number>;

/** ランク補正を持つ能力。命中・回避は倍率表が異なる。 */
export const STAGED_STATS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"] as const;
export type StagedStat = (typeof STAGED_STATS)[number];
export type StatStages = Record<StagedStat, number>;

export type MoveCategory = "physical" | "special" | "status";

/** v0.2 では単体対象のみ。ダブル対応の余地として値を分けてある。 */
export type MoveTarget = "foe" | "self";

/** 状態異常。同時に1つのみ。混乱は別枠（volatile）。 */
export const STATUSES = ["poison", "toxic", "paralysis", "burn", "sleep", "freeze"] as const;
export type StatusId = (typeof STATUSES)[number];

/**
 * ID 型。
 * 設計では tools/gen-ids.ts が JSON から実際のユニオン型を生成する（v0.4）。
 */
export type SpeciesId = string;
export type MoveId = string;
export type NatureId = string;
export type AbilityId = string;
export type ItemId = string;
export type NamedId = string;
export type CupId = string;
export type RegionId = string;
/** キャラの戦術。AI が読んで遂行する（v1.2）。今は重複検出のための札。 */
export type TacticId = string;

// ─────────────────────────────────────────────
// マスタデータ
// ─────────────────────────────────────────────

export type Species = {
  id: SpeciesId;
  dexNo: number;
  name: string;
  types: [Type] | [Type, Type];
  baseStats: StatSpread;
  /** 通常特性1〜2種。先頭が既定。隠れ特性は v0.8 以降。 */
  abilities: AbilityId[];
  learnset: { level: number; move: MoveId }[];
  /**
   * わざマシンで覚えられる技（v1.1-a）。
   *
   * **レベル技と別枠にする。** `learnset` は「いつ覚えるか」の表で、
   * こちらは「覚えられるか」だけの集合 ―― 一緒にすると
   * 「Lv0 で覚える技」という嘘のレベルを書くことになる。
   * わざマシンそのもの（何番が何の技か・どこで買えるか）は道具側の話で、
   * ここは互換表だけを持つ。
   */
  tmMoves: MoveId[];
  /** 進化の枝（v0.8）。条件が未実装の枝も、無視される形で残す。 */
  evolutions: Evolution[];
  catchRate: number;
  expType: ExpType;
  /** 倒したときに与える経験値の基礎値。v0.8 時点では BST からの推定（暫定）。 */
  baseExp: number;
  evYield: Partial<StatSpread>;
  genderRatio: number | null;
};

/**
 * 手持ち・ボックスに入る1体（v0.8）。**セーブされるのはこの形。**
 *
 * 操作する関数は `pokemon.ts` にある。型だけをここに置くのは、
 * `normalize.ts` が「バトルに出る3つの出どころ」の1つとしてこれを受け取るため
 * （型が下、関数が上、という向きを保つ）。
 */
export type PokemonInstance = {
  /** 個体の同一性。器を移っても変わらない（capture.md §4）。 */
  uid: string;
  species: SpeciesId;
  nickname?: string;
  /** 累計経験値が正。レベルはここから導く（二重に持つと必ずずれる）。 */
  exp: number;
  ivs: StatSpread;
  evs: StatSpread;
  nature: NatureId;
  ability: AbilityId;
  moves: { id: MoveId; pp: number }[];
  currentHp: number;
  status: StatusId | null;
  /** もうどくの経過ターン。バトル外では 0。 */
  statusCounter: number;
  item: ItemId | null;
  friendship: number;
  shiny: boolean;
  gender: "male" | "female" | null;
  /** 捕まえた地方・レベル。図鑑と表示に使う。 */
  met: { region: string; level: number };
};

/** 成長曲線。progression.md §7。 */
export const EXP_TYPES = [
  "erratic", "fast", "medium-fast", "medium-slow", "slow", "fluctuating",
] as const;
export type ExpType = (typeof EXP_TYPES)[number];

/**
 * 進化の枝。
 *
 * `kind` は原作の条件をそのまま写す。**未実装の条件も落とさずに持つ** ――
 * 落とすと「実装したときに何を繋げばよいか」がデータから消える。
 * 通信交換は道具に置き換える（progression.md §11）。
 */
export type Evolution = {
  to: SpeciesId;
  kind: "level" | "levelFriendship" | "useItem" | "trade" | "other";
  level?: number;
  item?: ItemId;
  /** 原作の条件文（「なつき度が高い状態でレベルアップ」等）。表示と実装の手掛かり。 */
  note?: string;
};

export type Move = {
  id: MoveId;
  name: string;
  type: Type;
  category: MoveCategory;
  /** 変化技は null。 */
  power: number | null;
  /** null は必中。 */
  accuracy: number | null;
  pp: number;
  priority: number;
  target: MoveTarget;
  /** 急所ランクの加算。きりさく等。既定 0。 */
  critStage?: number;
  /**
   * 相手に触れる技か。せいでんき・ゴツゴツメット等が参照する（v0.5）。
   * 分類からは導けない（じしんは物理だが非接触）ためデータとして持つ。
   */
  contact?: boolean;
  effect?: MoveEffect;
};

/**
 * 技の効果。効果ID とハンドラのレジストリで解決する。
 * 技を1件足しても、既存の kind の組み合わせならコードは増えない。
 * 設計: docs/design/battle-system.md §11
 */
export type MoveEffect =
  | { kind: "recoil"; ratio: number }
  | { kind: "drain"; ratio: number }
  | { kind: "heal"; ratio: number }
  | { kind: "status"; status: StatusId; chance: number }
  | { kind: "confuse"; chance: number }
  | { kind: "flinch"; chance: number }
  | {
      kind: "statChange";
      target: "self" | "foe";
      stat: StagedStat;
      stages: number;
      chance: number;
    }
  | { kind: "multiHit"; min: number; max: number }
  /**
   * 何も起きない（v1.1-a）。
   *
   * **「効果を書き忘れた」と「本当に何も起きない」を区別するために要る。**
   * 検証は「変化技に効果が無い」を落とすので、はねる のような技は
   * 効果が無いのではなく「何も起きない効果」を持つ、と書く。
   */
  | { kind: "nothing" }
  /**
   * へんしん（v1.1-i）。相手の姿・タイプ・能力・技をコピーする。
   *
   * **HP はコピーしない**（原作どおり）。技の PP は5に切り詰める。
   * メタモンは原作でもこの技しか覚えないので、
   * **これが無いと「技を1つも持てない個体」になって野生に出せない**
   * ―― 出現表の取り込みが1つの版から言い続けていた宿題。
   */
  | { kind: "transform" }
  /**
   * テレポート（v1.1-i）。**野生戦から抜ける。**
   *
   * トレーナー戦では何も起きない（原作どおり）。
   * 逃げるのは「使った側」なので、野生のケーシィが使えば向こうが消える ――
   * これが無いと、ケーシィは Lv16 まで技を1つも持てず野生に出せない。
   */
  | { kind: "fleeWild" };

// ─────────────────────────────────────────────
// 特性・持ち物（v0.5）
// ─────────────────────────────────────────────

/**
 * 特性と持ち物は「バトル中に常時はたらく効果」という点で同じものなので、
 * 効果の語彙を1つに統一する。
 *
 * これをしないと、あついしぼう（特性）とタイプ半減の実（持ち物）のように
 * 中身が同じ効果を2回実装することになる。
 * ハンドラは held.ts の1つのレジストリに集約される。
 *
 * 設計: docs/design/battle-system.md §12 / docs/design/progression.md §6
 */
export type HeldEffect =
  // ── 与ダメージ ──
  /** ピンチ時（HP 1/3以下）に特定タイプの技を強化。もうか・げきりゅう等。 */
  | { kind: "pinchBoost"; moveType: Type; ratio: number }
  /** 特定タイプの技を常時強化。もくたん等のタイプ強化アイテム。 */
  | { kind: "typeBoost"; moveType: Type; ratio: number }
  /** 効果抜群のときだけ強化。たつじんのおび。 */
  | { kind: "superEffectiveBoost"; ratio: number }
  /** 威力上昇と引き換えに反動を受ける。いのちのたま。 */
  | { kind: "powerRecoil"; ratio: number; recoil: number }
  // ── 被ダメージ ──
  /** 特定タイプの技を半減。あついしぼう。 */
  | { kind: "typeResist"; moveTypes: Type[]; ratio: number }
  // ── 実数値・命中・急所 ──
  /** 実数値の倍率。とつげきチョッキのように技を制限するものもある。 */
  | { kind: "statMultiplier"; stat: StatId; ratio: number; banStatusMoves?: boolean }
  /** こだわり系。実数値が上がる代わりに、最初に選んだ技しか使えなくなる。 */
  | { kind: "choice"; stat: StatId; ratio: number }
  /** 状態異常のとき こうげき上昇。こんじょう（やけどの威力減少も無視する）。 */
  | { kind: "statusAtkBoost"; ratio: number }
  /** 命中率の倍率。ふくがん。 */
  | { kind: "accuracyMultiplier"; ratio: number }
  /** 急所ランクの加算。ピントレンズ。 */
  | { kind: "critStage"; stages: number }
  /** 急所に当たらない。シェルアーマー・カブトアーマー。 */
  | { kind: "noCrit" }
  // ── 無効化 ──
  /** 特定タイプを無効化し、代わりに何かを得る。ふゆう・ちょすい・もらいび等。 */
  | { kind: "typeAbsorb"; moveType: Type; gain: AbsorbGain }
  | { kind: "statusImmunity"; statuses: StatusId[] }
  | { kind: "confusionImmunity" }
  | { kind: "noFlinch" }
  /** 反動を受けない。いしあたま。 */
  | { kind: "noRecoil" }
  /** 技の追加効果を受けない。りんぷん。 */
  | { kind: "noSecondary" }
  /** 能力低下を無効にする。クリアボディ（all）・かいりきバサミ（atk）等。 */
  | { kind: "statDropImmunity"; stats: StagedStat[] | "all" }
  // ── 発動するもの ──
  /** 場に出たときのランク変化。いかく。 */
  | { kind: "switchInStatChange"; target: "self" | "foe"; stat: StagedStat; stages: number }
  /** 接触技を受けたとき、相手を状態異常にする。せいでんき等。複数なら抽選。 */
  | { kind: "contactStatus"; statuses: StatusId[]; chance: number }
  /** 接触技を受けたとき、相手にダメージ。ゴツゴツメット。 */
  | { kind: "contactDamage"; ratio: number }
  /** 攻撃技に一定確率でひるみを追加する。あくしゅう。 */
  | { kind: "addFlinch"; chance: number }
  /** HP満タンから一撃で倒される攻撃を1で耐える。がんじょう・きあいのタスキ。 */
  | { kind: "endure" }
  /** ターン終了時に回復。たべのこし。 */
  | { kind: "endOfTurnHeal"; ratio: number }
  /** ターン終了時に持ち主自身を状態異常にする。かえんだま・どくどくだま。 */
  | { kind: "statusOnHolder"; status: StatusId }
  /** HP が閾値を割ったら回復する木の実。オボンのみ。 */
  | { kind: "berryHeal"; ratio: number; threshold: number }
  /** 状態異常・混乱を治す木の実。ラムのみ。 */
  | { kind: "berryCure" }
  /** ターン終了時に一定確率で状態異常が治る。だっぴ。 */
  | { kind: "endOfTurnCure"; chance: number }
  /** 交代すると状態異常が治る。しぜんかいふく。 */
  | { kind: "switchOutCure" }
  /** 状態異常にされたら、相手にも同じものを返す。シンクロ。 */
  | { kind: "synchronize" }
  /** 場に出たとき相手の特性をコピーする。トレース。 */
  | { kind: "trace" }
  /** 自分に使われた技の PP を余分に減らす。プレッシャー。 */
  | { kind: "pressure" }
  /** 特定タイプの相手を交代できなくする。じりょく。 */
  | { kind: "trapType"; trapped: Type }
  /** ねむりが早く覚める。はやおき。 */
  | { kind: "earlyBird" }
  /**
   * バトル中は何もしない特性・持ち物。
   * 「未実装の機構を必要とする」ものを黙って無効にせず、理由を明示して持つ。
   * 天候（v1.2）やメロメロのように、機構が入った時点でここから外れる。
   */
  | { kind: "inert"; reason: string };

/** typeAbsorb で無効化したときに得るもの。 */
export type AbsorbGain =
  | { kind: "none" }
  | { kind: "heal"; ratio: number }
  | { kind: "stat"; stat: StagedStat; stages: number }
  /** そのタイプの自分の技が強化される。もらいび。 */
  | { kind: "boostMoveType"; ratio: number };

export type Ability = {
  id: AbilityId;
  name: string;
  effect: HeldEffect;
};

export type ItemCategory =
  | "recovery"
  | "ball"
  | "held"
  | "evolution"
  | "training"
  | "tm"
  | "key"
  | "treasure";

/**
 * バッグから「つかう」効果（v0.9）。
 *
 * 持たせる効果（`HeldEffect`）とは**別物**として持つ。同じ「道具の効果」でも、
 * 発動条件も対象も違う ―― 混ぜると「持たせると回復し続けるきずぐすり」のような
 * 意味の無い組み合わせが型として通ってしまう。
 *
 * 技効果・持ち物効果・イベントコマンドと同じで、**種類は増やさずデータを増やす。**
 * きずぐすり・すごいきずぐすり・かいふくのくすりは全部 `heal` の数値違い。
 */
export type UseEffect =
  /** HP を固定値だけ回復する。 */
  | { kind: "heal"; amount: number }
  /** HP を最大値の割合で回復する（1 なら全回復）。 */
  | { kind: "healRatio"; ratio: number }
  /** 状態異常を治す。空配列なら全ての状態異常。 */
  | { kind: "cure"; status: StatusId[] }
  /** ひんしから復活させる。`ratio` は戻る HP の割合。 */
  | { kind: "revive"; ratio: number }
  /** PP を回復する。`all` なら全ての技。 */
  | { kind: "pp"; amount: number; all: boolean }
  /**
   * まとめて効かせる（かいふくのくすり = 全回復 + 状態異常）。
   * 1つでも効けば成功。条件（`Condition`）の `and` / `or` と同じ合成。
   */
  | { kind: "multi"; of: UseEffect[] }
  /**
   * わざマシン（v1.1-b）。**覚えさせるのはここではない。**
   * 4つ埋まっているときの入れ替えはプレイヤーの選択なので、
   * レベルアップの `canLearn` と同じく「提案」を返して UI に渡す。
   */
  | { kind: "teachMove"; move: MoveId }
  /**
   * 進化させる道具（v1.1-b）。**引数を持たない** ―― どの種が何に進化するかは
   * `Species.evolutions` が持っていて、道具の側は「自分が鍵になる枝」を探すだけ。
   *
   * `via` は探す枝の種類。`item` は進化の石（`Evolution.item` が自分と一致する枝）、
   * `trade` は通信交換の代替（つながりのヒモ・progression.md §11）で、
   * 交換時に持たせる道具が要る枝は**その道具を持たせた状態**でだけ成立する。
   */
  | { kind: "evolveByItem"; via: "item" | "trade" };

/** その道具をどこで使えるか。 */
export type UseScope = "battle" | "field" | "both";

export type Item = {
  id: ItemId;
  name: string;
  category: ItemCategory;
  /** お金で買えない道具（training 等）は price を持たない。economy.md §7 */
  price?: number;
  /**
   * BP交換所での値段（v0.9）。
   *
   * **お金と BP は別の経済**（economy.md §7）。対戦で強い持ち物は
   * お金では買えず、施設を遊んで得た BP でしか手に入らない。
   */
  bpPrice?: number;
  /**
   * 持たせたときのバトル中の効果。
   * バッグから「つかう」効果は `use` が担う（v0.9）。
   */
  held?: HeldEffect;
  /** バッグから「つかう」効果（v0.9）。 */
  use?: UseEffect;
  /** どこで使えるか。`use` がある道具だけが持つ。既定は `both`。 */
  useScope?: UseScope;
  /** 発動すると無くなる（きのみ・きあいのタスキ）。 */
  consumable?: boolean;
};

/**
 * ボールの捕獲補正（v0.8）。
 *
 * **条件付きの補正を `if` の羅列にしない。** 技効果・持ち物効果と同じデータ駆動で、
 * ボールを1種足すのは JSON を1行足すこと（capture.md §3）。
 */
export type Ball = {
  id: ItemId;
  bonus: BallBonus;
};

export type BallBonus =
  /** 常に一定の倍率。モンスターボール・スーパーボール・ハイパーボール。 */
  | { kind: "flat"; value: number }
  /** 必ず捕まる。マスターボール。 */
  | { kind: "guaranteed" }
  /** 相手のタイプが一致すれば。ネットボール。 */
  | { kind: "type"; types: Type[]; value: number; fallback: number }
  /** 早い / 長引いたターンで。クイック・タイマーボール。 */
  | { kind: "turnAtMost"; turns: number; value: number; fallback: number }
  | { kind: "turnAtLeast"; turns: number; value: number; fallback: number }
  /** 場所で。ダークボール（洞窟）。 */
  | { kind: "terrain"; terrain: string; value: number; fallback: number }
  /** 図鑑で捕獲済みなら。リピートボール。 */
  | { kind: "alreadyCaught"; value: number; fallback: number };

export type NatureModifier = {
  id: NatureId;
  name: string;
  increased: StatId | null;
  decreased: StatId | null;
};

/** 攻撃タイプ → 防御タイプ → 倍率。 */
export type TypeChart = Record<Type, Record<Type, number>>;

// ─────────────────────────────────────────────
// バトル
// ─────────────────────────────────────────────

export type SideIndex = 0 | 1;

export type BattleMove = {
  id: MoveId;
  pp: number;
  maxPp: number;
};

/** 交代で消える一時的な状態。 */
export type Volatile = {
  confusionTurns: number;
  flinched: boolean;
  /** こだわり系で固定された技。null なら制限なし。 */
  choiceLocked: MoveId | null;
  /** もらいびで強化されたタイプ。 */
  boostedMoveType: Type | null;
  /**
   * へんしん する前の姿（v1.1-i）。`null` なら変身していない。
   *
   * **`innateAbility` と同じ形。** 交代で戻すものは、戻す先を持っておく ――
   * 持たずに書き換えると「戻す」が実装できず、
   * ボックスに入れた個体まで別の種になりかねない。
   * HP は写さないので、ここにも入れない。
   */
  transformedFrom: {
    species: SpeciesId;
    name: string;
    types: readonly Type[];
    stats: StatSpread;
    moves: BattleMove[];
    ability: AbilityId | null;
  } | null;
};

export type BattlePokemon = {
  species: SpeciesId;
  name: string;
  level: number;
  types: readonly Type[];
  /** 実数値。ランク補正はここに含めず、参照時に掛ける。 */
  stats: StatSpread;
  maxHp: number;
  currentHp: number;
  moves: BattleMove[];

  /** 現在の特性。トレースで書き換わるため innateAbility と分けて持つ。 */
  ability: AbilityId | null;
  /** 本来の特性。交代で ability をここへ戻す。 */
  innateAbility: AbilityId | null;
  item: ItemId | null;
  /** 消費済みの持ち物は復活しない（交代しても戻らない）。 */
  itemConsumed: boolean;

  status: StatusId | null;
  /** ねむりの残りターン / もうどくの経過ターン。 */
  statusCounter: number;
  statStages: StatStages;
  volatile: Volatile;
};

export type Side = {
  party: BattlePokemon[];
  activeIndex: number;
};

export type RngState = {
  s: number;
  calls: number;
};

/**
 * 採点の観点（v0.11・バトルアリーナ）。
 *
 * ターン制限で決着がつかなかったとき、この順に比べて勝者を決める。
 * **観点を並べる順が規則**であって、点数の計算式は持たない ――
 * 「HPの残りで比べ、同じなら与えたダメージで比べる」と読めることが要件。
 */
export const JUDGE_CRITERIA = ["hpRatio", "damageDealt", "movesHit"] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];
export type JudgeRule = { criteria: JudgeCriterion[] };

/** 採点のための集計。ターン制限のあるバトルだけが使う。 */
export type BattleTally = { damageDealt: number; movesHit: number };

export type BattleState = {
  sides: [Side, Side];
  turn: number;
  rng: RngState;
  /**
   * 野生戦か。逃走が選べるのは野生戦だけ（トレーナー戦では選択肢に出さない）。
   * v0.7 で追加。
   */
  isWild: boolean;
  /**
   * サファリの段階（v1.1-h）。**サファリでなければ null。**
   *
   * 「段階を持っているか」がそのまま「サファリか」の判定になるので、
   * `isSafari` のような真偽値をもう1つ持たずに済む ――
   * 2つ持つと「サファリなのに段階が無い」状態が表現できてしまう。
   */
  safari: { rocks: number; baits: number } | null;
  /** 逃走を試みた回数。試すほど成功しやすくなる（原作準拠）。 */
  runAttempts: number;
  result: {
    winner: SideIndex | null;
    /** `judged` はターン制限による採点決着（v0.11）。 */
    reason: "faint" | "escaped" | "caught" | "judged";
  } | null;
  /**
   * ターン制限（v0.11）。`null` なら「ひんしまで」―― 通常のバトルはこちら。
   * 施設のルールセットが持っている値を `createBattle` が受け取って置く。
   */
  limit: { turns: number; judge: JudgeRule } | null;
  /** 採点用の集計。制限が無くても数えておく（数えるだけなら害が無い）。 */
  tally: [BattleTally, BattleTally];
  /** 野生戦で使ったボール（v0.8）。捕獲後の処理で誰が捕まえたかを見る。 */
  caughtWith?: ItemId;
  /**
   * ひんしにより交代を要求されている側。
   * 空でない間、次の step はその側の switch 行動のみを処理し、ターンを進めない。
   */
  pendingSwitch: SideIndex[];
};

/**
 * 行動。v0.7 時点で実装済みなのは move / switch / run。
 * item（ボール・回復薬）は v0.8。型は v0.1 から4種すべて定義してある。
 * 設計: docs/design/battle-system.md §2
 */
export type Action =
  | { kind: "move"; moveIndex: number }
  | { kind: "switch"; partyIndex: number }
  /**
   * バッグの道具を使う（ボールは v0.8、回復薬は v0.9）。
   * `target` は自分の手持ちの位置。省略すると場に出ている1体。
   */
  | { kind: "item"; item: ItemId; target?: number }
  /**
   * サファリのエサ・イシ（v1.1-h）。**技が使えない場所での「削る」代わり。**
   *
   * 道具にしていないのは、バッグに入るとサファリの外へ持ち出せてしまい、
   * 「その場所だけの規則」という前提が消えるから ―― `MapData.rules` の意味が無くなる。
   */
  | { kind: "safari"; throw: "bait" | "rock" }
  | { kind: "run" };

export type Effectiveness = 0 | 0.25 | 0.5 | 1 | 2 | 4;

/** 行動できなかった理由。 */
export type BlockedReason = "sleep" | "freeze" | "paralysis" | "confusion" | "flinch";

/**
 * UI はこのイベント列を順に消費して演出する。
 * core は時間の概念を持たない。設計: docs/design/ui-flow.md §4
 */
export type BattleEvent =
  | { kind: "turnStart"; turn: number }
  | { kind: "switchIn"; side: SideIndex; partyIndex: number }
  | { kind: "moveUsed"; side: SideIndex; move: MoveId }
  | { kind: "struggle"; side: SideIndex }
  | { kind: "blocked"; side: SideIndex; reason: BlockedReason }
  | { kind: "wokeUp" | "thawed" | "snappedOut"; side: SideIndex }
  | { kind: "missed"; side: SideIndex }
  | { kind: "noEffect"; side: SideIndex }
  | { kind: "failed"; side: SideIndex }
  | {
      kind: "damage";
      side: SideIndex;
      amount: number;
      remainingHp: number;
      effectiveness: Effectiveness;
      critical: boolean;
    }
  | { kind: "hitCount"; side: SideIndex; hits: number }
  | { kind: "confusionHit"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "recoil"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "drain" | "heal"; side: SideIndex; amount: number; remainingHp: number }
  | { kind: "statusApplied"; side: SideIndex; status: StatusId }
  | { kind: "confused"; side: SideIndex }
  | { kind: "statusDamage"; side: SideIndex; status: StatusId; amount: number; remainingHp: number }
  | { kind: "statChange"; side: SideIndex; stat: StagedStat; delta: number; stage: number }
  | { kind: "statChangeFailed"; side: SideIndex; stat: StagedStat }
  | { kind: "faint"; side: SideIndex }
  /**
   * ターン制限による採点決着（v0.11）。`by` はどの観点で差がついたか。
   * **`battleEnd` の直前に出る。** 「なぜその結果になったか」が読めないと、
   * 採点で負けたときに理不尽にしか見えない
   */
  | { kind: "judged"; winner: SideIndex | null; by: JudgeCriterion | null }
  | { kind: "transformed"; side: SideIndex; into: SpeciesId }
  | { kind: "battleEnd"; winner: SideIndex | null }
  // ── 特性・持ち物（v0.5）──
  /** 特性が発動した。UI は「〇〇の 〈特性名〉!」と出す。 */
  | { kind: "ability"; side: SideIndex; ability: AbilityId }
  | { kind: "item"; side: SideIndex; item: ItemId }
  /** ボールを投げた（v0.8）。`shakes` がそのまま演出の回数になる。 */
  | { kind: "ballThrown"; item: ItemId; shakes: number; caught: boolean }
  | { kind: "itemConsumed"; side: SideIndex; item: ItemId }
  /**
   * バッグから道具を使った（v0.9）。`text` は core が組み立てた結果。
   *
   * **使ったあとの状態も一緒に返す（v0.12）。** 返していなかったので、
   * 回復薬を使っても HPバーが動かなかった ―― UI は BattleState を
   * 覗きにいかない造りなので、イベントに乗っていないものは存在しないのと同じ。
   */
  | {
      kind: "itemUsed";
      side: SideIndex;
      item: ItemId;
      text: string;
      /** 誰に使ったか（手持ちの位置）。倒れている個体にも使える。 */
      target: number;
      remainingHp: number;
      status: StatusId | null;
    }
  | { kind: "itemDamage"; side: SideIndex; item: ItemId; amount: number; remainingHp: number }
  /** きあいのタスキ・がんじょうで持ちこたえた。 */
  | { kind: "endured"; side: SideIndex }
  /** 状態異常・混乱が治った。 */
  | { kind: "cured"; side: SideIndex }
  /** 特性が書き換わった（トレース）。 */
  | { kind: "abilityChanged"; side: SideIndex; ability: AbilityId }
  // ── 逃走（v0.7）──
  | { kind: "runFailed"; side: SideIndex }
  /** サファリのエサ・イシを投げた（v1.1-h）。 */
  | { kind: "safariThrown"; throw: "bait" | "rock" }
  /** サファリで相手が逃げていった（v1.1-h）。こちらが逃げる `escaped` とは別。 */
  | { kind: "fled" }
  | { kind: "escaped"; side: SideIndex };

export type StepResult = {
  state: BattleState;
  events: BattleEvent[];
};

export const EMPTY_STAGES: StatStages = {
  atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0,
};
