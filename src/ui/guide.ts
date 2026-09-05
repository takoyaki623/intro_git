import { RUN_CONFIG } from '../domain/run'
import { DRAFT_CONFIG } from '../domain/draft'
import { TIER_CONFIG } from '../domain/tiers'

const KEY = 'pokemon-battle:guide-seen'

/**
 * Whether the player has been shown the rules once.
 *
 * Its own key, not part of a run: a run is thrown away every time one ends, and
 * being told the rules again on every new party would be worse than never being
 * told at all.
 */
export function hasSeenGuide(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(KEY) === '1'
  } catch {
    // A blocked store means the guide opens again next time. Harmless, and
    // better than the alternative of never opening it.
    return false
  }
}

export function markGuideSeen(storage: Storage = localStorage): void {
  try {
    storage.setItem(KEY, '1')
  } catch {
    // Nothing useful to do if the store refuses.
  }
}

export function forgetGuide(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing useful to do if the store refuses.
  }
}

/**
 * The rules, in the order a first-time player meets them: the run, then the
 * screen they are actually looking at, then the battle.
 *
 * Read off the config rather than written out, so retuning the game cannot
 * leave the explanation of it lying.
 */
export const GUIDE_SECTIONS: readonly {
  readonly heading: string
  readonly lines: readonly string[]
}[] = [
  {
    heading: `${RUN_CONFIG.battlesToClear}かい かちぬけば クリア`,
    lines: [
      `さいごの ${RUN_CONFIG.battlesToClear}かいめは ボスが 1ぴきで まっています。`,
      'ひんしした ポケモンは そのランの あいだ もどりません。HP も もちこします。',
      `クリアすると つぎの だんかいが あきます（ぜんぶで ${TIER_CONFIG.max}つ）。`,
    ],
  },
  {
    heading: `さいしょに ${DRAFT_CONFIG.candidates}ひきから ${DRAFT_CONFIG.picks}びき えらびます`,
    lines: [
      'えらんだ じゅんばんが そのまま てもちの じゅんばん。1ばんめが せんぱつです。',
      'しゅぞくち：つよさの ごうけい。ただし タイプの あいしょうの ほうが よく ききます。',
      'こうげき ○○：その ポケモンが だせる こうげきの タイプ。',
    ],
  },
  {
    heading: 'バトル',
    lines: [
      'タイプの あいしょうで ダメージが 2ばい・はんぶん・0 に なります。',
      'こうたいは 1ターン つかいます（とんぼがえり などを のぞく）。',
      'かつと ごほうびを 1つ。わざを おぼえるのは べつわくで、とっても ごほうびは へりません。',
    ],
  },
]
