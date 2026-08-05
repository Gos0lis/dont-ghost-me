import clsx from 'clsx'
import type { BountyStatus, MemberStatus, ProjectStatus } from '../../contracts/types'
import { bountyStatusLabel, memberStatusLabel, projectStatusLabel } from '../../utils/format'

type Status = ProjectStatus | MemberStatus | BountyStatus

export function StatusBadge({ status }: { status: Status }) {
  const label =
    status in projectStatusLabel
      ? projectStatusLabel[status as ProjectStatus]
      : status in memberStatusLabel
        ? memberStatusLabel[status as MemberStatus]
        : bountyStatusLabel[status as BountyStatus]
  return (
    <span
      className={clsx('status-badge', {
        'status-danger':
          status === 'quit' || status === 'rescue_needed' || status === 'rejected' || status === 'cancelled',
        'status-warning': status === 'open' || status === 'revision_required',
        'status-info': status === 'claimed' || status === 'submitted' || status === 'rescue_in_progress',
        'status-success':
          status === 'active' || status === 'active_again' || status === 'completed' || status === 'paid' || status === 'approved',
      })}
    >
      <span className="status-dot" />
      {label}
    </span>
  )
}
