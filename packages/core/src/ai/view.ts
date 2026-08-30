/**
 * AI に渡す、制限された盤面（v0.5）。
 *
 * **AI に BattleState をそのまま渡さない。** これが AI 設計で最も重要な判断。
 * そのまま渡すと、実装者が無意識に「相手の手持ち・技・持ち物を知っている」
 * 前提のコードを書いてしまい、一度そうなると剥がせない。型で縛る。
 *
 * 強さは情報量ではなく思考の深さで作る。極ティアのネームドも fair で戦う。
 * 設計: docs/design/ai.md §2
 */

import { activeScreens, legalActions } from "../battle.js";
import type { GameData } from "../gamedata.js";
import type {
  Action,
  BattleEvent,
  BattlePokemon,
  BattleState,
  MoveId,
  SideIndex,
  ScreenId,
  SpeciesId,
  StatStages,
  StatusId,
  Type,
  WeatherId,
} from "../types.js";

export type AiConfig = {
  policy: "random" | "basic" | "smart";
  /** その確率で最善手を外す。0 で最善、1 でほぼランダム。 */
  mistakeRate: number;
  knowledge: "fair" | "partial";
};

export type AiView = {
  own: {
    active: BattlePokemon;
    party: readonly BattlePokemon[];
    activeIndex: number;
    /** 自分の側に張ってある壁（v1.2-c）。重ね張りを最善手だと思わないために要る。 */
    screens: readonly ScreenId[];
  };
  foe: {
    species: SpeciesId;
    name: string;
    level: number;
    types: readonly Type[];
    /** 割合だけ。実数値は見えない。 */
    hpRatio: number;
    status: StatusId | null;
    statStages: StatStages;
    /** 一度でも使われた技だけ。 */
    revealedMoves: readonly MoveId[];
    /** 相手の側の壁（v1.2-c）。**これも隠さない** ―― 張られたのは見えている。 */
    screens: readonly ScreenId[];
    /** 一度でも場に出た個体だけ。partial 知識なら控えも見える。 */
    revealedParty: readonly SpeciesId[];
    remaining: number;
  };
  turn: number;
  /**
   * 場の天気（v1.2-c）。**これは隠さない。**
   * 天気は両者に見えているもので、隠すと AI が
   * 「にほんばれ中の みずでっぽう」を最善手だと思い込む。
   */
  weather: WeatherId | null;
  legal: readonly Action[];
};

/**
 * 相手について「見えたもの」の記録。
 * BattleState には入れない ―― バトルの結果に影響しない、観測者側の情報のため。
 */
export type AiKnowledge = {
  revealedMoves: MoveId[];
  revealedParty: SpeciesId[];
};

export const createKnowledge = (): AiKnowledge => ({ revealedMoves: [], revealedParty: [] });

/** イベント列から、相手について分かったことを取り込む。 */
export function observe(
  knowledge: AiKnowledge,
  state: BattleState,
  events: readonly BattleEvent[],
  foeSide: SideIndex,
): void {
  const add = <T>(list: T[], value: T) => {
    if (!list.includes(value)) list.push(value);
  };
  add(knowledge.revealedParty, activeOf(state, foeSide).species);
  for (const event of events) {
    if (event.kind === "moveUsed" && event.side === foeSide) {
      add(knowledge.revealedMoves, event.move);
    }
    if (event.kind === "switchIn" && event.side === foeSide) {
      add(knowledge.revealedParty, state.sides[foeSide].party[event.partyIndex]!.species);
    }
  }
}

const activeOf = (state: BattleState, side: SideIndex): BattlePokemon =>
  state.sides[side].party[state.sides[side].activeIndex]!;

export function toAiView(
  data: GameData,
  state: BattleState,
  side: SideIndex,
  config: AiConfig,
  knowledge: AiKnowledge = createKnowledge(),
): AiView {
  const foeSide: SideIndex = side === 0 ? 1 : 0;
  const foe = activeOf(state, foeSide);
  const foeParty = state.sides[foeSide].party;

  return {
    own: {
      active: activeOf(state, side),
      party: state.sides[side].party,
      activeIndex: state.sides[side].activeIndex,
      screens: activeScreens(state.sides[side]),
    },
    foe: {
      species: foe.species,
      name: foe.name,
      level: foe.level,
      types: foe.types,
      hpRatio: foe.maxHp === 0 ? 0 : foe.currentHp / foe.maxHp,
      status: foe.status,
      statStages: foe.statStages,
      revealedMoves: [...knowledge.revealedMoves],
      screens: activeScreens(state.sides[foeSide]),
      // partial 知識でも見えるのは種族名だけ。技と持ち物は最後まで見えない
      revealedParty:
        config.knowledge === "partial"
          ? foeParty.map((p) => p.species)
          : [...knowledge.revealedParty],
      remaining: foeParty.filter((p) => p.currentHp > 0).length,
    },
    turn: state.turn,
    weather: state.weather?.kind ?? null,
    legal: legalActions(data, state, side),
  };
}
