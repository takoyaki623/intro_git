import { useState } from 'react'
import type { BattlePokemon, Move } from '../domain/entities'
import type { RewardOffer, RewardTarget } from '../domain/rewards'
import { needsTarget, targetsFor } from '../domain/rewards'
import { rewardDetail, rewardTitle } from '../ui/messages'

interface Props {
  offer: readonly RewardOffer[]
  /** A move the party may take on. Free: taking it does not spend the reward. */
  moveOffer: Move | null
  members: readonly BattlePokemon[]
  /** Picks still owed. Two after an elite, which the heading has to say. */
  picksLeft: number
  onSelect: (offer: RewardOffer, target: RewardTarget | null) => void
  onTeach: (target: RewardTarget) => void
  onPass: () => void
}

/** What the screen is currently asking for. */
type Asking =
  | { readonly step: 'reward' }
  | { readonly step: 'who'; readonly offer: RewardOffer }
  | { readonly step: 'slot'; readonly move: Move; readonly member: number }
  | { readonly step: 'teachWho'; readonly move: Move }

/**
 * The screen after a win: one reward of three, and a move the party may take on.
 *
 * The move sits beside the three rather than among them. Measured, a run ends
 * when the party runs out of bodies, so a reward that does not keep one
 * standing loses to そせい and なかま every time -- making the player trade a
 * body for a move was a trap, not a choice, so taking the move is free.
 *
 * The steps live here rather than in the run: none of it is progress until the
 * last tap, so a reload drops a half-made choice and puts the offers back.
 */
export function RewardChoice({
  offer,
  moveOffer,
  members,
  picksLeft,
  onSelect,
  onTeach,
  onPass,
}: Props) {
  const [asking, setAsking] = useState<Asking>({ step: 'reward' })
  const back = () => setAsking({ step: 'reward' })

  if (asking.step === 'slot') {
    const target = members[asking.member]
    return (
      <section className="rewards" aria-label="いれかえる わざを えらぶ">
        <h2>どの わざと いれかえますか？</h2>
        <div className="reward-row">
          {target?.moves.map((move, slot) => (
            <button
              key={move.id}
              type="button"
              onClick={() => {
                // Back to the top before the parent re-renders: the move is
                // taken, so there is no slot screen left to be standing on.
                back()
                onTeach({ member: asking.member, slot })
              }}
            >
              <strong>{move.name}</strong>
              <span className="meta">{rewardDetail({ kind: 'teach', move })}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="cancel"
          onClick={() => setAsking({ step: 'teachWho', move: asking.move })}
        >
          もどる
        </button>
      </section>
    )
  }

  if (asking.step === 'who' || asking.step === 'teachWho') {
    const current: RewardOffer =
      asking.step === 'who' ? asking.offer : { kind: 'teach', move: asking.move }
    const allowed = targetsFor(current, members)
    const aimAt = (index: number) => {
      if (asking.step === 'teachWho') {
        return setAsking({ step: 'slot', move: asking.move, member: index })
      }
      back()
      onSelect(asking.offer, { member: index })
    }
    return (
      <section className="rewards" aria-label="だれに あげるか えらぶ">
        <h2>{`${rewardTitle(current)}：だれに？`}</h2>
        <div className="reward-row">
          {allowed.map((index) => {
            const target = members[index]
            if (!target) return null
            return (
              <button key={target.species.id} type="button" onClick={() => aimAt(index)}>
                <strong>{target.species.name}</strong>
                <span className="meta">
                  {current.kind === 'teach'
                    ? target.moves.map((move) => move.name).join('・')
                    : `Lv${target.level} ・ ${target.currentHp} / ${target.stats.hp}`}
                </span>
              </button>
            )
          })}
        </div>
        <button type="button" className="cancel" onClick={back}>
          もどる
        </button>
      </section>
    )
  }

  return (
    <>
      {moveOffer ? (
        <section className="rewards teaching" aria-label="わざを おぼえる">
          <h2>{`${moveOffer.name}を おぼえますか？（ごほうびとは べつ）`}</h2>
          <div className="reward-row">
            <button
              type="button"
              onClick={() => setAsking({ step: 'teachWho', move: moveOffer })}
            >
              <strong>{`${moveOffer.name}を おぼえる`}</strong>
              <span className="meta">
                {rewardDetail({ kind: 'teach', move: moveOffer })}
              </span>
            </button>
          </div>
          <button type="button" className="cancel" onClick={onPass}>
            おぼえない
          </button>
        </section>
      ) : null}

      <section className="rewards" aria-label="ごほうびを えらぶ">
        <h2>
          {picksLeft > 1
            ? `ごほうびを えらんでください（あと ${picksLeft}つ）`
            : 'ごほうびを えらんでください'}
        </h2>
        <div className="reward-row">
          {offer.map((entry) => (
            <button
              key={entry.kind}
              type="button"
              onClick={() =>
                needsTarget(entry)
                  ? setAsking({ step: 'who', offer: entry })
                  : onSelect(entry, null)
              }
            >
              <strong>{rewardTitle(entry)}</strong>
              <span className="meta">{rewardDetail(entry)}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
