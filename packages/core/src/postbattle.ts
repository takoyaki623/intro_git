/**
 * 戦闘後シーケンス（v0.8）。
 *
 * 設計で「バトル終了イベントに戦闘結果を含める」の一行しかなかった部分。
 * 経験値・努力値・進化・図鑑は別々の章に設計があったが、
 * **誰がいつ実行するかがどの章にも書かれていなかった**（battle-system.md §10.5）。
 *
 * ここが「決まった順序で1回だけ実行する」場所になる。
 * 順序が意味を持つ ―― 努力値を先に足すとレベルアップ時の実数値が変わり、
 * 進化を先にすると覚える技が変わる。
 */

import { expGain, expForLevel, MAX_LEVEL } from "./exp.js";
import type { GameData } from "./gamedata.js";
import { levelOf, maxHpOf, type PokemonInstance } from "./pokemon.js";
import { calcAllStats } from "./stats.js";
import type { BattlePokemon, Evolution, MoveId, SpeciesId, StatSpread } from "./types.js";
import { STATS } from "./types.js";

/** UI に「これを見せてくれ」と返すもの。バトルの `BattleEvent` と同じ考え方。 */
export type PostBattleEvent =
  | { kind: "expGained"; uid: string; amount: number }
  | { kind: "levelUp"; uid: string; from: number; to: number; gained: Partial<StatSpread> }
  /** 技を覚えられる。枠が空いていなければ UI が入れ替えを聞く。 */
  | { kind: "canLearn"; uid: string; move: MoveId; hasRoom: boolean }
  | { kind: "learned"; uid: string; move: MoveId }
  | { kind: "canEvolve"; uid: string; to: SpeciesId }
  | { kind: "dexUpdated"; species: SpeciesId; state: "seen" | "caught" };

export type DexState = "unknown" | "seen" | "caught";

export type BattleOutcomeInput = {
  /** 参加した個体（uid → 個体）。バトル後の状態が既に書き戻されていること。 */
  party: readonly PokemonInstance[];
  /** 経験値を分ける対象の uid。倒れた個体は含めない。 */
  participants: readonly string[];
  /** 倒した相手。 */
  defeated: readonly BattlePokemon[];
  /** 対面した相手（図鑑の seen 用）。倒していなくても含む。 */
  encountered: readonly SpeciesId[];
  isWild: boolean;
  /** 周回加速（progression.md §7）。 */
  expMultiplier?: number;
  dex: Readonly<Record<string, DexState>>;
};

export type BattleOutcomeResult = {
  party: PokemonInstance[];
  dex: Record<string, DexState>;
  events: PostBattleEvent[];
};

/**
 * 実行順（battle-system.md §10.5）。
 *   1. 経験値 → 2. レベルアップ → 3. 技習得の提案 → 4. 努力値
 *   → 5. なつき度 → 6. 進化判定 → 7. 図鑑
 */
export function applyBattleResult(
  data: GameData,
  input: BattleOutcomeInput,
): BattleOutcomeResult {
  const events: PostBattleEvent[] = [];
  const participants = new Set(input.participants);
  const party = input.party.map((p) => ({ ...p, moves: p.moves.map((m) => ({ ...m })) }));

  for (const instance of party) {
    if (!participants.has(instance.uid)) continue;
    if (instance.currentHp <= 0) continue; // 倒れた個体は貰えない

    const before = levelOf(data, instance);

    // ── 1. 経験値 ──
    let gained = 0;
    for (const foe of input.defeated) {
      gained += expGain(data, {
        fainted: foe,
        winnerLevel: before,
        isWild: input.isWild,
        ...(input.expMultiplier === undefined ? {} : { multiplier: input.expMultiplier }),
      });
    }
    // 参加者で山分けする（原作準拠）
    gained = Math.max(1, Math.floor(gained / Math.max(1, participants.size)));
    if (gained > 0) {
      const cap = expForLevel(data, data.species(instance.species).expType, MAX_LEVEL);
      instance.exp = Math.min(cap, instance.exp + gained);
      events.push({ kind: "expGained", uid: instance.uid, amount: gained });
    }

    // ── 2. レベルアップ → 実数値の再計算 ──
    const after = levelOf(data, instance);
    if (after > before) {
      const gainedStats = statDelta(data, instance, before, after);
      // 上がったぶんの最大HPをそのまま今のHPにも足す（原作の挙動）
      instance.currentHp = Math.min(
        maxHpOf(data, instance),
        instance.currentHp + (gainedStats.hp ?? 0),
      );
      events.push({ kind: "levelUp", uid: instance.uid, from: before, to: after, gained: gainedStats });

      // ── 3. 技習得の提案 ──
      // **ここで自動的には覚えさせない。** 4つ埋まっているときの入れ替えは
      // プレイヤーの選択なので、UI に返して待つ
      for (const entry of data.species(instance.species).learnset) {
        if (entry.level <= before || entry.level > after) continue;
        if (instance.moves.some((m) => m.id === entry.move)) continue;
        const hasRoom = instance.moves.length < 4;
        if (hasRoom) {
          instance.moves.push({ id: entry.move, pp: data.move(entry.move).pp });
          events.push({ kind: "learned", uid: instance.uid, move: entry.move });
        } else {
          events.push({ kind: "canLearn", uid: instance.uid, move: entry.move, hasRoom });
        }
      }
    }

    // ── 4. 努力値 ──
    addEvs(data, instance, input.defeated);

    // ── 5. なつき度 ──
    instance.friendship = Math.min(255, instance.friendship + (after > before ? 3 : 1));

    // ── 6. 進化判定 ──
    // **提案するだけ。** 実際に進化させるのは UI が演出を出したあと
    const evo = evolutionFor(data, instance, after);
    if (evo !== null) events.push({ kind: "canEvolve", uid: instance.uid, to: evo.to });
  }

  // ── 7. 図鑑 ──
  const dex: Record<string, DexState> = { ...input.dex };
  for (const species of input.encountered) {
    if ((dex[species] ?? "unknown") === "unknown") {
      dex[species] = "seen";
      events.push({ kind: "dexUpdated", species, state: "seen" });
    }
  }

  return { party, dex, events };
}

/** レベルが上がったときに増えた実数値。 */
function statDelta(
  data: GameData,
  instance: PokemonInstance,
  from: number,
  to: number,
): Partial<StatSpread> {
  const species = data.species(instance.species);
  const at = (level: number) =>
    calcAllStats(data, species, level, instance.ivs, instance.evs, instance.nature);
  const before = at(from);
  const after = at(to);

  const out: Partial<StatSpread> = {};
  for (const stat of STATS) {
    const delta = after[stat] - before[stat];
    if (delta !== 0) out[stat] = delta;
  }
  return out;
}

/** 努力値の上限は合計510・各252（progression.md §4）。 */
const EV_TOTAL_CAP = 510;
const EV_STAT_CAP = 252;

function addEvs(data: GameData, instance: PokemonInstance, defeated: readonly BattlePokemon[]): void {
  for (const foe of defeated) {
    const yields = data.species(foe.species).evYield;
    for (const stat of STATS) {
      const gain = yields[stat] ?? 0;
      if (gain === 0) continue;
      const total = STATS.reduce((n, s) => n + instance.evs[s], 0);
      if (total >= EV_TOTAL_CAP) return;
      const room = Math.min(gain, EV_STAT_CAP - instance.evs[stat], EV_TOTAL_CAP - total);
      if (room > 0) instance.evs[stat] += room;
    }
  }
}

/**
 * 今このレベルで起きる進化。無ければ null。
 *
 * **未実装の条件（道具・通信交換）は静かに無視する。**
 * データからは落とさないので、機構が入れば同じ表がそのまま効く。
 */
export function evolutionFor(
  data: GameData,
  instance: PokemonInstance,
  level: number,
): Evolution | null {
  const FRIENDSHIP_THRESHOLD = 160;
  for (const evo of data.species(instance.species).evolutions) {
    if (evo.kind === "level" && evo.level !== undefined && level >= evo.level) return evo;
    if (evo.kind === "levelFriendship" && instance.friendship >= FRIENDSHIP_THRESHOLD) return evo;
  }
  return null;
}

/**
 * 進化させる。
 * **技は引き継ぐ**（進化で覚え直しはしない）。HP は割合を保つ。
 */
export function evolve(
  data: GameData,
  instance: PokemonInstance,
  to: SpeciesId,
): PokemonInstance {
  const before = maxHpOf(data, instance);
  const ratio = before === 0 ? 1 : instance.currentHp / before;
  const species = data.species(to);
  const next: PokemonInstance = {
    ...instance,
    species: to,
    // 進化後の種族が同じ特性を持たないことがある。持たなければ既定に落とす
    ability: species.abilities.includes(instance.ability) ? instance.ability : species.abilities[0] ?? "",
  };
  next.currentHp = Math.max(1, Math.round(maxHpOf(data, next) * ratio));
  return next;
}

/** 覚えている技を1つ入れ替える。 */
export function replaceMove(
  data: GameData,
  instance: PokemonInstance,
  index: number,
  move: MoveId,
): PokemonInstance {
  const moves = instance.moves.map((m) => ({ ...m }));
  if (index < 0 || index >= moves.length) throw new RangeError(`invalid move slot: ${index}`);
  moves[index] = { id: move, pp: data.move(move).pp };
  return { ...instance, moves };
}
