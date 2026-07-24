import { ArrowRight, Clock3, Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { PrimaryButton } from '../components/ui/Buttons'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useAppStore } from '../store/useAppStore'
import { formatDate } from '../utils/format'

export function MyTasksPage() {
  const wallet = useAppStore((state) => state.wallet)
  const bounties = useAppStore((state) => state.bounties)
  const tasks = bounties.filter((bounty) => bounty.rescuerId === wallet.account?.id)
  return (
    <div className="page-shell">
      <PageHeader eyebrow="Builder Workspace" title="我的救场任务" description="查看已领取任务、提交进度和奖励到账状态。" />
      {!wallet.isConnected || wallet.account?.role !== 'rescuer' ? (
        <EmptyState title="切换到 Builder 07 查看任务" description="连接钱包后，在右上角将演示账户切换为外部救场者。" action={<Link to="/bounties"><PrimaryButton>去悬赏大厅</PrimaryButton></Link>} />
      ) : tasks.length === 0 ? (
        <EmptyState title="暂无救场任务" description="先去悬赏大厅领取一个你能完成的任务。" action={<Link to="/bounties"><PrimaryButton>去悬赏大厅</PrimaryButton></Link>} />
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="task-card-head"><img src="/assets/pigeons/pigeon-builder-laptop.png" alt="" /><StatusBadge status={task.status} /></div>
              <h2>{task.title}</h2><p>{task.description}</p>
              <div className="tag-row">{task.skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}</div>
              <div className="task-progress"><div><span>任务进度</span><strong>{task.status === 'claimed' ? '60%' : task.status === 'submitted' ? '90%' : task.status === 'paid' ? '100%' : '75%'}</strong></div><div className="progress-track"><span style={{ width: task.status === 'claimed' ? '60%' : task.status === 'submitted' ? '90%' : '100%' }} /></div></div>
              <div className="task-meta"><span><Coins size={15} />{task.reward} MON</span><span><Clock3 size={15} />{formatDate(task.deadline)}</span></div>
              {['claimed', 'revision_required'].includes(task.status) ? <Link to={`/bounty/${task.id}/submit`}><PrimaryButton>前往提交 <ArrowRight size={16} /></PrimaryButton></Link> : <Link to={`/bounty/${task.id}`}><PrimaryButton>查看任务详情</PrimaryButton></Link>}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
