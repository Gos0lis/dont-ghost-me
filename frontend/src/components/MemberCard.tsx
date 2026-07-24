import { Coins, LockKeyhole } from 'lucide-react'
import type { ProjectMember } from '../contracts/types'
import { StatusBadge } from './ui/StatusBadge'
import { shortenAddress } from '../utils/format'

export function MemberCard({ member }: { member: ProjectMember }) {
  return (
    <article className={`member-card ${member.status === 'quit' ? 'member-quit' : ''}`}>
      <div className="member-avatar">{member.name.slice(0, 1)}</div>
      <div className="member-main">
        <div className="member-title">
          <div><strong>{member.name}</strong><span>{member.role}</span></div>
          <StatusBadge status={member.status} />
        </div>
        <p>{member.task}</p>
        <div className="member-meta">
          <span>{shortenAddress(member.address)}</span>
          <span><Coins size={14} />{member.deposit} MON</span>
          <span><LockKeyhole size={14} />{member.depositLocked ? '已锁定' : member.status === 'quit' ? '转入救场池' : '未锁定'}</span>
        </div>
      </div>
    </article>
  )
}
