import type { Move, Species } from '../domain/entities'
import type { BattleEvent } from '../domain/events'
import type { PokemonType } from '../domain/types'
import type { StatusKind } from '../domain/status'
import type { StatKey } from '../domain/stages'
import type { AbilityKind } from '../domain/abilities'
import type { ItemKind } from '../domain/items'
import type { RewardKind } from '../domain/rewards'
import { REWARD_CONFIG } from '../domain/rewards'

export const TYPE_NAMES: Record<PokemonType, string> = {
  normal: 'ノーマル',
  fire: 'ほのお',
  water: 'みず',
  electric: 'でんき',
  grass: 'くさ',
  ice: 'こおり',
  fighting: 'かくとう',
  poison: 'どく',
  ground: 'じめん',
  flying: 'ひこう',
  psychic: 'エスパー',
  bug: 'むし',
  rock: 'いわ',
  ghost: 'ゴースト',
  dragon: 'ドラゴン',
  dark: 'あく',
  steel: 'はがね',
  fairy: 'フェアリー',
}

/**
 * One battle event as a line of Japanese.
 *
 * Returns null for events the log stays quiet about. Damage is the case that
 * matters: the games never print a number, but the event still carries one so
 * the UI can animate the health bar or float a figure over the sprite later.
 */
export const STATUS_NAMES: Record<StatusKind, string> = {
  poison: 'どく',
  burn: 'やけど',
  paralysis: 'まひ',
  sleep: 'ねむり',
  freeze: 'こおり',
}

const INFLICTED: Record<StatusKind, (pokemon: string) => string> = {
  poison: (p) => `${p}は どくを あびた！`,
  burn: (p) => `${p}は やけどを おった！`,
  paralysis: (p) => `${p}は まひして わざが でにくくなった！`,
  sleep: (p) => `${p}は ねむってしまった！`,
  freeze: (p) => `${p}は こおりついた！`,
}

const IMMOBILISED: Record<StatusKind, (pokemon: string) => string> = {
  poison: (p) => `${p}は うごけない！`,
  burn: (p) => `${p}は うごけない！`,
  paralysis: (p) => `${p}は からだが しびれて うごけない！`,
  sleep: (p) => `${p}は ぐうぐう ねむっている`,
  freeze: (p) => `${p}は こおって しまって うごけない！`,
}

const ENDED: Record<StatusKind, (pokemon: string) => string> = {
  poison: (p) => `${p}の どくが なおった！`,
  burn: (p) => `${p}の やけどが なおった！`,
  paralysis: (p) => `${p}の まひが なおった！`,
  sleep: (p) => `${p}は めを さました！`,
  freeze: (p) => `${p}の こおりが とけた！`,
}

export const ABILITY_NAMES: Record<AbilityKind, string> = {
  intimidate: 'いかく',
  levitate: 'ふゆう',
  waterAbsorb: 'ちょすい',
  sturdy: 'がんじょう',
}

export const ITEM_NAMES: Record<ItemKind, string> = {
  leftovers: 'たべのこし',
  focusSash: 'きあいのタスキ',
  expertBelt: 'たつじんのおび',
  sitrusBerry: 'オボンのみ',
}

export const ITEM_DETAILS: Record<ItemKind, string> = {
  leftovers: 'ターンごとに すこし かいふく',
  focusSash: 'まんたんから の いちげきを 1 で たえる',
  expertBelt: 'こうかばつぐんの わざが つよくなる',
  sitrusBerry: 'HP が はんぶんを われば かいふく',
}

export const REWARD_NAMES: Record<RewardKind, string> = {
  heal: 'ぜんかいふく',
  revive: 'そせい',
  levelUp: 'レベルアップ',
  recruit: 'なかまを ふやす',
  item: 'もちものを もらう',
}

/** Read off REWARD_CONFIG, so retuning the numbers cannot leave the copy lying. */
export const REWARD_DETAILS: Record<RewardKind, string> = {
  heal: 'たっている ぜんいんの HP が まんたんに',
  revive: `ひんしの 1 ぴきが HP ${Math.round(REWARD_CONFIG.reviveFraction * 100)}% で ふっかつ`,
  levelUp: `てもち ぜんいんの レベルが +${REWARD_CONFIG.levelsGained}`,
  recruit: 'あたらしい なかまが 1 ぴき くわわる',
  item: 'てもちの 1 ぴきが もちものを もつ',
}

export const STAT_NAMES: Record<StatKey, string> = {
  attack: 'こうげき',
  defense: 'ぼうぎょ',
  specialAttack: 'とくこう',
  specialDefense: 'とくぼう',
  speed: 'すばやさ',
}

/** How the games word a stat moving by one step, two, or more. */
function stageWording(applied: number): string {
  if (applied >= 3) return 'ぐぐーんと あがった！'
  if (applied === 2) return 'ぐーんと あがった！'
  if (applied === 1) return 'あがった！'
  if (applied === -1) return 'さがった！'
  if (applied === -2) return 'がくっと さがった！'
  return 'がくーんと さがった！'
}

/**
 * What a move does beyond its damage, as the button shows it.
 *
 * The move data has carried its accuracy and its effects all along; this is
 * what puts them in front of the player, who is otherwise asked to choose
 * between でんじは and つるぎのまい with both reading "でんき・へんか".
 */
export function moveEffectSummary(move: Move): string | null {
  const parts: string[] = []

  if (move.stageChange) {
    const { target, stat, delta } = move.stageChange
    const who = target === 'self' ? '' : 'あいての '
    const sign = delta > 0 ? `+${delta}` : `${delta}`
    parts.push(`${who}${STAT_NAMES[stat]} ${sign}`)
  }

  if (move.effect) {
    const chance = Math.round(move.effect.chance * 100)
    const name = STATUS_NAMES[move.effect.status]
    parts.push(chance >= 100 ? name : `${name} ${chance}%`)
  }

  return parts.length > 0 ? parts.join('・') : null
}

/** Accuracy, shown only when it is not certain -- the exception is the point. */
export function moveAccuracySummary(move: Move): string | null {
  return move.accuracy >= 1 ? null : `命中 ${Math.round(move.accuracy * 100)}`
}

export function formatEvent(event: BattleEvent): string | null {
  switch (event.kind) {
    case 'encounter':
      return event.final
        ? `さいごの あいて ${event.pokemon}が たちふさがった！`
        : `やせいの ${event.pokemon}が とびだしてきた！`
    case 'useMove':
      return `${event.pokemon}の ${event.move}！`
    case 'miss':
      return `${event.pokemon}の こうげきは はずれた！`
    case 'critical':
      return 'きゅうしょに あたった！'
    case 'effectiveness':
      if (event.multiplier === 0) return `${event.target}には こうかが ないようだ...`
      if (event.multiplier > 1) return 'こうかは ばつぐんだ！'
      if (event.multiplier < 1) return 'こうかは いまひとつのようだ...'
      return null
    case 'faint':
      return `${event.pokemon}は たおれた！`
    case 'withdraw':
      return event.side === 'player'
        ? `${event.pokemon} もどれ！`
        : `あいては ${event.pokemon}を ひっこめた！`
    case 'sendOut':
      return event.side === 'player'
        ? `ゆけっ！ ${event.pokemon}！`
        : `あいては ${event.pokemon}を くりだした！`
    case 'statusInflicted':
      return INFLICTED[event.status](event.pokemon)
    case 'immobilised':
      return IMMOBILISED[event.status](event.pokemon)
    case 'statStage': {
      const stat = STAT_NAMES[event.stat]
      if (event.applied === 0) {
        return event.delta > 0
          ? `${event.pokemon}の ${stat}は もう あがらない！`
          : `${event.pokemon}の ${stat}は もう さがらない！`
      }
      return `${event.pokemon}の ${stat}が ${stageWording(event.applied)}`
    }
    case 'ability': {
      const name = ABILITY_NAMES[event.ability]
      switch (event.outcome) {
        case 'announced':
          return `${event.pokemon}の ${name}！`
        case 'immune':
          return `${event.pokemon}の ${name}！ こうかが ない！`
        case 'heal':
          return `${event.pokemon}は ${name}で かいふくした！`
        case 'endured':
          return `${event.pokemon}は ${name}で もちこたえた！`
      }
      return null
    }
    case 'item': {
      const name = ITEM_NAMES[event.item]
      return event.outcome === 'endured'
        ? `${event.pokemon}は ${name}で もちこたえた！`
        : `${event.pokemon}は ${name}で かいふくした！`
    }
    case 'statusEnded':
      return ENDED[event.status](event.pokemon)
    case 'statusDamage':
      return `${event.pokemon}は ${STATUS_NAMES[event.status]}の ダメージを うけている！`
    case 'damage':
      return null
  }
}

/** The log as the player reads it, with the silent events dropped. */
export function formatLog(events: readonly BattleEvent[]): string[] {
  return events.map(formatEvent).filter((line): line is string => line !== null)
}

export function outcomeMessage(
  winner: 'player' | 'opponent',
  playerName: string,
  opponentName: string,
): string {
  return winner === 'player'
    ? `${opponentName}を たおした！`
    : `${playerName}は たおれてしまった...`
}

/**
 * The types a Pokemon can actually hit with, in the order its moves are listed
 * and without repeats.
 *
 * The draft is a type decision, and a party's coverage is the thing that is
 * hard to read off four move names at a glance.
 */
export function coverageSummary(species: Species): string | null {
  const types = species.moves
    .filter((move) => move.category !== 'status')
    .map((move) => move.type)
  const distinct = [...new Set(types)]
  if (distinct.length === 0) return null
  return distinct.map((type) => TYPE_NAMES[type]).join('・')
}
