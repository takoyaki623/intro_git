/**
 * イベントのインタプリタ（v0.7）。
 *
 * バトルと同じ考え方で作る ―― **core は時間を持たない。**
 * `message` のように演出を伴うコマンドは、実行を中断して UI に制御を返す。
 * UI が「読み終わった」と言ってきたら続きを実行する。
 *
 * コマンドはレジストリで解決する。技効果・持ち物効果と同じで、
 * **地方を追加してもコマンドの種類は増えない**（増えるのはデータだけ）。
 *
 * 設計: docs/design/world.md §6
 */

import type { ItemId, MoveId, RegionId, SpeciesId } from "../types.js";
import type {
  Condition,
  Direction,
  EventCommand,
  EventId,
  FieldAbilityId,
  FlagId,
  MapId,
  ShopId,
  TrainerId,
} from "./types.js";

/** イベントが読み書きする世界の状態。セーブの一部（v0.9 で本実装）。 */
export type WorldState = {
  flags: Record<FlagId, boolean>;
  badges: number;
  money: number;
  bag: Record<ItemId, number>;
  partySpecies: SpeciesId[];
  /**
   * 今使えるフィールド技（v0.12-d）。
   *
   * **`Condition` から毎回導く派生値**で、セーブには載せない。
   * 保存してしまうと「フラグは消えたのに、なみのりだけ使える」状態が作れる。
   */
  abilities: FieldAbilityId[];
  /**
   * この訪問でどけた障害物（v0.12-d）。`obstacleKey()` の文字列。
   * これもセーブに載せない ―― 出入りすれば元に戻る（原作と同じ）。
   */
  cleared: string[];
};

export const emptyWorldState = (): WorldState => ({
  flags: {},
  badges: 0,
  money: 3000,
  bag: {},
  partySpecies: [],
  abilities: [],
  cleared: [],
});

/** 条件の評価。用途をまたいで1つだけ持つ（分岐の仕組みを3つに分けない）。 */
export function evaluate(cond: Condition, world: WorldState): boolean {
  switch (cond.kind) {
    case "flag":
      return (world.flags[cond.flag] ?? false) === cond.value;
    case "badges":
      return world.badges >= cond.count;
    case "hasItem":
      return (world.bag[cond.item] ?? 0) > 0;
    case "hasSpecies":
      return world.partySpecies.includes(cond.species);
    case "and":
      return cond.of.every((c) => evaluate(c, world));
    case "or":
      return cond.of.some((c) => evaluate(c, world));
  }
}

// ─────────────────────────────────────────────
// UI へ返す要求
// ─────────────────────────────────────────────

/**
 * インタプリタが UI に「これをやってくれ」と返すもの。
 * `core` は実際に文字を出したり待ったりしない。
 */
export type EventEffect =
  | { kind: "message"; speaker?: string | undefined; text: string }
  | { kind: "choice"; prompt: string; options: string[] }
  | { kind: "wait"; frames: number }
  | { kind: "playSe" }
  | { kind: "faceObject"; object: string; direction: Direction }
  | { kind: "warp"; to: MapId; x: number; y: number; facing?: Direction | undefined }
  | { kind: "battle"; trainer: TrainerId; onWin?: EventId | undefined; onLose?: EventId | undefined }
  | { kind: "shop"; inventory: ShopId }
  | { kind: "openBox" }
  | { kind: "openDex" }
  | { kind: "enterRegion"; region: RegionId }
  | { kind: "returnToHub" }
  | { kind: "giveBadge"; count: number }
  | { kind: "openFacility" }
  | { kind: "openExchange" }
  | { kind: "openTournament" }
  | { kind: "openStorage" }
  | { kind: "gotItem"; item: ItemId; count: number }
  | { kind: "gotPokemon"; species: SpeciesId; level: number; moves: MoveId[] }
  | { kind: "moneyChanged"; delta: number }
  | { kind: "healed" };

/** 実行を止めて UI の応答を待つ種類か。 */
const BLOCKING = new Set<EventEffect["kind"]>([
  "message",
  "choice",
  "wait",
  "faceObject",
  "battle",
  "shop",
  "openBox",
  "openDex",
  // 拠点（v0.10）。どれも別画面を開くので、閉じるまでイベントを止める
  "enterRegion",
  "returnToHub",
  "openFacility",
  "openExchange",
  "openTournament",
  "openStorage",
]);

/**
 * 実行の途中状態。
 *
 * **セーブしない。** イベントは原子的に完了するものとして扱う
 * （長いイベントはフラグで区切って分割する）。
 * ここに現れる中断は「今まさに文章を読んでいる」程度の短いもの。
 */
export type EventRunner = {
  /** 未実行のコマンド。先頭から消費する。 */
  queue: EventCommand[];
  /** choice の選択待ちなら、その分岐先。 */
  pendingChoice: { options: EventCommand[][] } | null;
  done: boolean;
};

export const startEvent = (commands: readonly EventCommand[]): EventRunner => ({
  queue: [...commands],
  pendingChoice: null,
  done: commands.length === 0,
});

export type StepEventResult = {
  runner: EventRunner;
  /** 今回発生した演出。UI が順に処理する。 */
  effects: EventEffect[];
  /** UI の応答を待っているか。 */
  waiting: boolean;
};

type Handler = (
  command: EventCommand,
  world: WorldState,
  runner: EventRunner,
  effects: EventEffect[],
) => void;

/**
 * コマンド → ハンドラ。
 * **新しいコマンドを足すときだけここに1件書く。**
 * イベントを1つ足すのは JSON だけで済む。
 */
const handlers: { [K in EventCommand["kind"]]: Handler } = {
  message: (c, _w, _r, effects) => {
    if (c.kind !== "message") return;
    effects.push({ kind: "message", speaker: c.speaker, text: c.text });
  },

  choice: (c, _w, runner, effects) => {
    if (c.kind !== "choice") return;
    effects.push({ kind: "choice", prompt: c.prompt, options: c.options.map((o) => o.text) });
    runner.pendingChoice = { options: c.options.map((o) => o.then) };
  },

  if: (c, world, runner) => {
    if (c.kind !== "if") return;
    const branch = evaluate(c.cond, world) ? c.then : (c.else ?? []);
    // 分岐は「その場で展開する」。実行は止めない
    runner.queue.unshift(...branch);
  },

  setFlag: (c, world) => {
    if (c.kind !== "setFlag") return;
    world.flags[c.flag] = c.value;
  },

  battle: (c, _w, _r, effects) => {
    if (c.kind !== "battle") return;
    effects.push({ kind: "battle", trainer: c.trainer, onWin: c.onWin, onLose: c.onLose });
  },

  giveItem: (c, world, _r, effects) => {
    if (c.kind !== "giveItem") return;
    world.bag[c.item] = (world.bag[c.item] ?? 0) + c.count;
    effects.push({ kind: "gotItem", item: c.item, count: c.count });
  },

  givePokemon: (c, world, _r, effects) => {
    if (c.kind !== "givePokemon") return;
    world.partySpecies.push(c.species);
    // 技の指定はここで落とさない。落とすと「データに書いたのに反映されない」になる
    effects.push({ kind: "gotPokemon", species: c.species, level: c.level, moves: c.moves ?? [] });
  },

  giveMoney: (c, world, _r, effects) => {
    if (c.kind !== "giveMoney") return;
    world.money += c.amount;
    effects.push({ kind: "moneyChanged", delta: c.amount });
  },

  takeMoney: (c, world, _r, effects) => {
    if (c.kind !== "takeMoney") return;
    const taken = Math.min(world.money, c.amount);
    world.money -= taken;
    effects.push({ kind: "moneyChanged", delta: -taken });
  },

  healParty: (_c, _w, _r, effects) => {
    effects.push({ kind: "healed" });
  },

  warp: (c, _w, _r, effects) => {
    if (c.kind !== "warp") return;
    effects.push({ kind: "warp", to: c.to, x: c.x, y: c.y, facing: c.facing });
  },

  faceObject: (c, _w, _r, effects) => {
    if (c.kind !== "faceObject") return;
    effects.push({ kind: "faceObject", object: c.object, direction: c.direction });
  },

  wait: (c, _w, _r, effects) => {
    if (c.kind !== "wait") return;
    effects.push({ kind: "wait", frames: c.frames });
  },

  playSe: (_c, _w, _r, effects) => {
    effects.push({ kind: "playSe" });
  },

  shop: (c, _w, _r, effects) => {
    if (c.kind !== "shop") return;
    effects.push({ kind: "shop", inventory: c.inventory });
  },

  openBox: (_c, _w, _r, effects) => {
    effects.push({ kind: "openBox" });
  },

  openDex: (_c, _w, _r, effects) => {
    effects.push({ kind: "openDex" });
  },

  // ── 拠点（v0.10）──
  // 拠点は9地方とエンドゲームを束ねる唯一の場所。**どれもマップ上の
  // オブジェクトから開く**ので、専用の画面遷移ではなくコマンドとして持つ

  enterRegion: (c, _w, _r, effects) => {
    if (c.kind !== "enterRegion") return;
    effects.push({ kind: "enterRegion", region: c.region });
  },

  returnToHub: (_c, _w, _r, effects) => {
    effects.push({ kind: "returnToHub" });
  },

  giveBadge: (c, world, _r, effects) => {
    if (c.kind !== "giveBadge") return;
    // 到達点なので、少ない方へは下げない
    world.badges = Math.max(world.badges, c.count);
    effects.push({ kind: "giveBadge", count: world.badges });
  },

  openFacility: (_c, _w, _r, effects) => {
    effects.push({ kind: "openFacility" });
  },

  /**
   * BP交換所（v0.11 で `openFacility` から分けた）。
   *
   * v0.9 まで施設と BP交換所は**同じタブ**だったので、1つの画面に同居していた。
   * v0.10 で場所を2つに分けた（バトル施設＝`hub-tower` / BP交換所＝`hub-depot`）のに、
   * **画面を割らなかった** ―― 結果、保管庫から連戦を始められた。
   *
   * タブを場所に置き換えるときは、**画面の中身も一緒に割る**。
   * 場所が2つあるのに中身が1つだと、行った先が同じものになる。
   */
  openExchange: (_c, _w, _r, effects) => {
    effects.push({ kind: "openExchange" });
  },

  openTournament: (_c, _w, _r, effects) => {
    effects.push({ kind: "openTournament" });
  },

  openStorage: (_c, _w, _r, effects) => {
    effects.push({ kind: "openStorage" });
  },
};

/**
 * 次の中断点まで実行する。
 *
 * 中断を伴わないコマンド（setFlag・if・giveItem…）はまとめて処理し、
 * `message` のような演出に当たったら止めて UI に返す。
 */
export function stepEvent(runner: EventRunner, world: WorldState): StepEventResult {
  const next: EventRunner = {
    queue: [...runner.queue],
    pendingChoice: runner.pendingChoice,
    done: runner.done,
  };
  const effects: EventEffect[] = [];

  if (next.pendingChoice !== null) {
    return { runner: next, effects, waiting: true };
  }

  while (next.queue.length > 0) {
    const command = next.queue.shift()!;
    const handler = handlers[command.kind];
    if (handler === undefined) {
      throw new Error(`no handler registered for event command: "${command.kind}"`);
    }
    const before = effects.length;
    handler(command, world, next, effects);

    const produced = effects.slice(before);
    if (produced.some((e) => BLOCKING.has(e.kind))) {
      return { runner: next, effects, waiting: true };
    }
  }

  next.done = true;
  return { runner: next, effects, waiting: false };
}

/** 選択肢の答えを受け取り、その分岐を実行キューの先頭に差し込む。 */
export function chooseOption(runner: EventRunner, index: number): EventRunner {
  const pending = runner.pendingChoice;
  if (pending === null) throw new Error("選択待ちではない");
  const branch = pending.options[index];
  if (branch === undefined) throw new RangeError(`invalid choice: ${index}`);
  return { queue: [...branch, ...runner.queue], pendingChoice: null, done: false };
}

/** 全 kind にハンドラが登録されていることを検証する（検証項目 #21）。 */
export function assertAllEventCommandsHandled(
  kinds: readonly EventCommand["kind"][],
): void {
  for (const kind of kinds) {
    if (handlers[kind] === undefined) {
      throw new Error(`no handler registered for event command: "${kind}"`);
    }
  }
}

/** データ検証から使う、コマンド一覧の走査。分岐の中も辿る。 */
export function walkCommands(commands: readonly EventCommand[]): EventCommand[] {
  const out: EventCommand[] = [];
  for (const command of commands) {
    out.push(command);
    if (command.kind === "if") {
      out.push(...walkCommands(command.then));
      out.push(...walkCommands(command.else ?? []));
    }
    if (command.kind === "choice") {
      for (const option of command.options) out.push(...walkCommands(option.then));
    }
  }
  return out;
}

/** 条件が参照するフラグを集める（宣言済みかの検証に使う）。 */
export function flagsUsedBy(cond: Condition): FlagId[] {
  switch (cond.kind) {
    case "flag":
      return [cond.flag];
    case "and":
    case "or":
      return cond.of.flatMap(flagsUsedBy);
    default:
      return [];
  }
}
