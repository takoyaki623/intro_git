import type { RewardKind } from '../domain/rewards'
import { REWARD_DETAILS, REWARD_NAMES } from '../ui/messages'

interface Props {
  offer: readonly RewardKind[]
  onSelect: (reward: RewardKind) => void
}

export function RewardChoice({ offer, onSelect }: Props) {
  return (
    <section className="rewards" aria-label="ごほうびを えらぶ">
      <h2>ごほうびを えらんでください</h2>
      <div className="reward-row">
        {offer.map((reward) => (
          <button key={reward} type="button" onClick={() => onSelect(reward)}>
            <strong>{REWARD_NAMES[reward]}</strong>
            <span className="meta">{REWARD_DETAILS[reward]}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
