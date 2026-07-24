import { Banknote, CircleAlert, ClipboardCheck, Flag, UserRoundCheck } from 'lucide-react'
import type { TimelineEvent } from '../contracts/types'
import { formatDate, shortenAddress } from '../utils/format'

const icons = {
  project: Flag,
  member: UserRoundCheck,
  warning: CircleAlert,
  bounty: Banknote,
  submission: ClipboardCheck,
  payment: Banknote,
}

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="timeline">
      {[...events].reverse().map((event) => {
        const Icon = icons[event.type]
        return (
          <article key={event.id} className={`timeline-item timeline-${event.type}`}>
            <div className="timeline-marker"><Icon size={15} /></div>
            <div>
              <div className="timeline-title"><strong>{event.title}</strong><time>{formatDate(event.timestamp)}</time></div>
              <p>{event.description}</p>
              {event.txHash && <code>{shortenAddress(event.txHash)}</code>}
            </div>
          </article>
        )
      })}
    </div>
  )
}
