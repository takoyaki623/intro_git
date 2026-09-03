import type { BattleEvent } from '../domain/events'
import type { PokemonType } from '../domain/types'
import type { StatusKind } from '../domain/status'
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

export const REWARD_NAMES: Record<RewardKind, string> = {
  heal: 'ぜんかいふく',
  revive: 'そせい',
  levelUp: 'レベルアップ',
  recruit: 'なかまを ふやす',
}

/** Read off REWARD_CONFIG, so retuning the numbers cannot leave the copy lying. */
export const REWARD_DETAILS: Record<RewardKind, string> = {
  heal: 'たっている ぜんいんの HP が まんたんに',
  revive: `ひんしの 1 ぴきが HP ${Math.round(REWARD_CONFIG.reviveFraction * 100)}% で ふっかつ`,
  levelUp: `てもち ぜんいんの レベルが +${REWARD_CONFIG.levelsGained}`,
  recruit: 'あたらしい なかまが 1 ぴき くわわる',
}

export function formatEvent(event: BattleEvent): string | null {
  switch (event.kind) {
    case 'encounter':
      return `やせいの ${event.pokemon}が とびだしてきた！`
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
