import { Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BountyStatus } from '../contracts/types'
import { BountyCard } from '../components/BountyCard'
import { PageHeader } from '../components/ui/PageHeader'
import { useAppStore } from '../store/useAppStore'

const filters: { label: string; value: 'all' | BountyStatus }[] = [
  { label: '全部', value: 'all' },
  { label: '等待领取', value: 'open' },
  { label: '进行中', value: 'claimed' },
  { label: '等待验收', value: 'submitted' },
  { label: '已完成', value: 'paid' },
]

export function BountiesPage() {
  const bounties = useAppStore((state) => state.bounties)
  const [filter, setFilter] = useState<'all' | BountyStatus>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => bounties.filter((bounty) => {
    const matchesFilter = filter === 'all' || bounty.status === filter
    const normalized = query.trim().toLowerCase()
    return matchesFilter && (!normalized || `${bounty.title} ${bounty.description} ${bounty.skills.join(' ')}`.toLowerCase().includes(normalized))
  }), [bounties, filter, query])

  return (
    <div className="page-shell">
      <PageHeader eyebrow="公开任务市场" title="救场悬赏大厅" description="违约不是终点，救场才是价值。找到你能补上的缺口，完成任务领取 MON 奖励。" />
      <div className="bounty-toolbar">
        <div className="filter-tabs">{filters.map((item) => <button className={filter === item.value ? 'active' : ''} key={item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
        <label className="search-box"><Search size={17} /><input placeholder="搜索悬赏标题或技能" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
      <div className="bounty-results-meta"><span><SlidersHorizontal size={15} />找到 {visible.length} 个救场任务</span><span>奖励来自承诺机制中的救场资金</span></div>
      <div className="bounty-list">{visible.map((bounty) => <BountyCard bounty={bounty} key={bounty.id} />)}</div>
      {visible.length === 0 && <div className="no-results">没有符合条件的救场悬赏，换个筛选条件试试。</div>}
    </div>
  )
}
