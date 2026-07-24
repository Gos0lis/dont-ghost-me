import { ArrowRight, Clock3, Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Bounty } from '../contracts/types'
import { StatusBadge } from './ui/StatusBadge'
import { formatDate } from '../utils/format'

export function BountyCard({ bounty, compact = false }: { bounty: Bounty; compact?: boolean }) {
  return (
    <article className={`bounty-card ${compact ? 'bounty-card-compact' : ''}`}>
      <div className="bounty-art">
        <img src="/assets/pigeons/pigeon-builder-laptop.png" alt="" />
      </div>
      <div className="bounty-content">
        <div className="bounty-topline"><StatusBadge status={bounty.status} /><span>{bounty.publisherName} 发布</span></div>
        <h3>{bounty.title}</h3>
        <p>{bounty.description}</p>
        <div className="tag-row">{bounty.skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}</div>
        <div className="bounty-footer">
          <div className="bounty-reward"><Coins size={17} /><strong>{bounty.reward}</strong> MON</div>
          <span><Clock3 size={15} />{formatDate(bounty.deadline)} 截止</span>
          <Link to={`/bounty/${bounty.id}`}>查看详情 <ArrowRight size={15} /></Link>
        </div>
      </div>
    </article>
  )
}
