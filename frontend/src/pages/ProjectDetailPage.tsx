import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  FileWarning,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BalanceCard } from '../components/BalanceCard'
import { BountyCard } from '../components/BountyCard'
import { MemberCard } from '../components/MemberCard'
import { Timeline } from '../components/Timeline'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useAppStore } from '../store/useAppStore'
import { formatDate } from '../utils/format'

export function ProjectDetailPage() {
  const { projectId = 'monad-hackathon' } = useParams()
  const navigate = useNavigate()
  const [quitOpen, setQuitOpen] = useState(false)
  const projects = useAppStore((state) => state.projects)
  const bounties = useAppStore((state) => state.bounties)
  const wallet = useAppStore((state) => state.wallet)
  const pending = useAppStore((state) => state.pendingMethod)
  const quitProject = useAppStore((state) => state.quitProject)
  const notify = useAppStore((state) => state.notify)
  const project = projects.find((item) => item.id === projectId)

  if (!project) return <div className="page-shell"><p>项目不存在。</p></div>
  const yunn = project.members.find((member) => member.id === 'yunn')
  const projectBounties = bounties.filter((bounty) => bounty.projectId === project.id && bounty.id === 'smart-contract-mvp')
  const isInitiator = wallet.account?.role === 'initiator'
  const canQuitYunn = isInitiator || wallet.account?.id === 'yunn'
  const needsRescue = project.status === 'rescue_needed'

  const ensureWallet = () => {
    if (!wallet.isConnected) {
      notify('info', '请先连接钱包', '连接后才能发起模拟链上交易')
      return false
    }
    return true
  }

  return (
    <div className="page-shell project-detail">
      <Link className="back-link" to="/projects"><ArrowLeft size={16} />返回我的项目</Link>
      <div className="project-hero-panel">
        <div>
          <div className="project-title-row"><span className="project-mark">M</span><StatusBadge status={project.status} /></div>
          <h1>{project.name}</h1>
          <p>{project.goal}</p>
          <div className="project-inline-meta">
            <span><CalendarDays size={15} />截止 {formatDate(project.deadline)}</span>
            <span><UsersRound size={15} />{project.members.length}/5 成员</span>
            <span><Clock3 size={15} />整体进度 {project.progress}%</span>
          </div>
        </div>
        <div className="project-hero-actions">
          {canQuitYunn && yunn?.status !== 'quit' && (
            <SecondaryButton icon={<FileWarning size={17} />} onClick={() => {
              if (ensureWallet()) setQuitOpen(true)
            }}>{isInitiator ? '模拟 Yunn 鸽掉' : '主动退出项目'}</SecondaryButton>
          )}
          {needsRescue && isInitiator && (
            <PrimaryButton onClick={() => navigate(`/project/${project.id}/create-bounty`)}>发布救场悬赏</PrimaryButton>
          )}
        </div>
      </div>

      {['rescue_needed', 'rescue_in_progress'].includes(project.status) && (
        <div className="warning-banner">
          <AlertTriangle size={23} />
          <div><strong>{project.status === 'rescue_needed' ? '项目处于等待救场状态' : '救场任务正在进行'}</strong><p>Yunn 已退出，其 100 MON 保证金进入救场池，用于修复智能合约任务缺口。</p></div>
          {needsRescue && isInitiator && <PrimaryButton onClick={() => navigate(`/project/${project.id}/create-bounty`)}>立即发布悬赏</PrimaryButton>}
        </div>
      )}
      {project.status === 'active_again' && (
        <div className="success-banner"><ShieldCheck size={22} /><div><strong>项目已恢复进行</strong><p>救场成果验收通过，智能合约任务缺口已修复。</p></div></div>
      )}

      <div className="balance-grid">
        <BalanceCard label="总保证金" value={project.totalDeposit} unit="MON" icon={<CircleDollarSign size={20} />} />
        <BalanceCard label="仍在锁定" value={project.lockedDeposit} unit="MON" accent="green" icon={<ShieldCheck size={20} />} />
        <BalanceCard label="救场悬赏池" value={project.rescuePool} unit="MON" accent="orange" icon={<Banknote size={20} />} />
        <BalanceCard label="整体进度" value={`${project.progress}%`} accent="purple" icon={<Clock3 size={20} />} />
      </div>

      <div className="project-columns">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">团队成员</span><h2>五人分工与保证金</h2></div><span>{project.members.length} 人</span></div>
          <div className="member-list">{project.members.map((member) => <MemberCard member={member} key={member.id} />)}</div>
        </section>
        <section className="panel timeline-panel">
          <div className="panel-heading"><div><span className="eyebrow">链上记录</span><h2>项目动态</h2></div></div>
          <Timeline events={project.timeline} />
        </section>
      </div>

      {projectBounties.length > 0 && (
        <section className="panel project-bounties">
          <div className="panel-heading"><div><span className="eyebrow">当前救场任务</span><h2>遗留缺口已经转成悬赏</h2></div></div>
          {projectBounties.map((bounty) => <BountyCard bounty={bounty} key={bounty.id} compact />)}
        </section>
      )}

      <ConfirmDialog
        open={quitOpen}
        danger
        loading={pending === 'quitProject'}
        title="确认将 Yunn 标记为退出？"
        description="其 100 MON 保证金将进入救场悬赏池，用于修复留下的智能合约任务缺口。该操作会生成模拟交易回执。"
        confirmLabel="确认退出并转入救场池"
        details={<><span>操作</span><strong>quitProject(projectId, "yunn")</strong><span>预计到账</span><strong>100 MON → 救场池</strong></>}
        onClose={() => setQuitOpen(false)}
        onConfirm={() => void quitProject(project.id, 'yunn').then(() => setQuitOpen(false)).catch(() => undefined)}
      />
    </div>
  )
}
