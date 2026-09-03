import type { BattleEvent } from '../domain/events'
import type { PokemonType } from '../domain/types'

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
