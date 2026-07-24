import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, Clock3, Coins, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PrimaryButton } from '../components/ui/Buttons'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useAppStore } from '../store/useAppStore'
import { formatDate, shortenAddress } from '../utils/format'

export function BountyDetailPage() {
  const { bountyId = '' } = useParams()
  const navigate = useNavigate()
  const [claimOpen, setClaimOpen] = useState(false)
  const bounties = useAppStore((state) => state.bounties)
  const projects = useAppStore((state) => state.projects)
  const wallet = useAppStore((state) => state.wallet)
  const claimBounty = useAppStore((state) => state.claimBounty)
  const notify = useAppStore((state) => state.notify)
  const pending = useAppStore((state) => state.pendingMethod === 'claimBounty')
  const bounty = bounties.find((item) => item.id === bountyId)
  const project = projects.find((item) => item.id === bounty?.projectId)
  if (!bounty) return <div className="page-shell">悬赏不存在。</div>

  const isRescuer = wallet.account?.role === 'rescuer'
  const isClaimedByMe = bounty.rescuerId === wallet.account?.id
  const action = () => {
    if (!wallet.isConnected) return notify('info', '请先连接钱包', '领取救场任务需要钱包签名')
    if (!isRescuer) return notify('info', '请切换到 Builder 07', '只有外部救场者账户可以领取任务')
    setClaimOpen(true)
  }

  return (
    <div className="page-shell bounty-detail-page">
      <Link className="back-link" to="/bounties"><ArrowLeft size={16} />返回悬赏大厅</Link>
      <div className="bounty-detail-hero">
        <div className="bounty-detail-art"><img src="/assets/pigeons/pigeon-builder-laptop.png" alt="" /></div>
        <div className="bounty-detail-title">
          <div className="tag-row"><StatusBadge status={bounty.status} />{bounty.skills.map((skill) => <span className="tag" key={skill}>{skill}</span>)}</div>
          <h1>{bounty.title}</h1>
          <p>{project?.name ?? 'Monad 黑客松作品开发'} · {bounty.publisherName} 发布</p>
          <div className="bounty-detail-meta"><span><Coins size={18} /><strong>{bounty.reward} MON</strong> 救场奖励</span><span><Clock3 size={17} />{formatDate(bounty.deadline)} 截止</span></div>
        </div>
        <div className="bounty-action-card">
          <span>悬赏奖励</span><strong>{bounty.reward}<small> MON</small></strong><p>资金已从救场悬赏池预留</p>
          {bounty.status === 'open' && <PrimaryButton onClick={action}>领取救场任务</PrimaryButton>}
          {isClaimedByMe && ['claimed', 'revision_required'].includes(bounty.status) && <PrimaryButton onClick={() => navigate(`/bounty/${bounty.id}/submit`)}>前往提交成果 <ArrowRight size={16} /></PrimaryButton>}
          {bounty.status === 'submitted' && wallet.account?.role === 'initiator' && <PrimaryButton onClick={() => navigate(`/project/${bounty.projectId}/review/${bounty.id}`)}>前往验收成果</PrimaryButton>}
          {bounty.status === 'paid' && <div className="paid-label"><CheckCircle2 size={18} />奖励已完成支付</div>}
        </div>
      </div>

      {bounty.rescuerName && (
        <div className="claimed-banner"><UserRound size={20} /><div><strong>{bounty.rescuerName} 已领取该任务</strong><p>{shortenAddress(bounty.rescuerAddress)} · 当前状态：{bounty.status === 'submitted' ? '等待团队验收' : bounty.status === 'paid' ? '救场完成' : '救场进行中'}</p></div></div>
      )}
      {bounty.revisionFeedback && <div className="revision-banner"><strong>团队修改意见</strong><p>{bounty.revisionFeedback}</p></div>}

      <div className="bounty-info-grid">
        <div className="bounty-info-main">
          <section className="panel"><span className="eyebrow">任务背景</span><h2>为什么需要救场？</h2><p className="prose">{bounty.description}</p></section>
          <section className="panel"><span className="eyebrow">交付内容</span><h2>你需要完成这些内容</h2><div className="check-list">{bounty.deliverables.map((item) => <div key={item}><CheckCircle2 size={18} /><span>{item}</span></div>)}</div></section>
          <section className="panel"><span className="eyebrow">验收标准</span><h2>团队会如何验收</h2><div className="check-list">{bounty.acceptanceCriteria.map((item) => <div key={item}><ShieldCheck size={18} /><span>{item}</span></div>)}</div></section>
        </div>
        <aside className="bounty-info-side">
          <section className="panel fund-source-card"><Banknote size={25} /><span className="eyebrow">资金来源说明</span><h3>来自退出成员的违约保证金</h3><p>该悬赏奖励来自退出成员的违约保证金，不是由原团队成员额外支付。</p><div><span>Yunn 保证金</span><strong>100 MON</strong></div><div><span>本悬赏预留</span><strong>{bounty.reward} MON</strong></div></section>
          <section className="panel publisher-card"><span>发布者</span><div><span className="member-avatar">C</span><div><strong>{bounty.publisherName}</strong><small>{shortenAddress(bounty.publisherAddress)}</small></div></div></section>
        </aside>
      </div>
      <ConfirmDialog
        open={claimOpen}
        title={`领取“${bounty.title}”？`}
        description={`确认后，该任务将记录到 Builder 07 名下。完成并通过验收后可获得 ${bounty.reward} MON。`}
        confirmLabel="确认领取任务"
        loading={pending}
        details={<><span>合约方法</span><strong>claimBounty("{bounty.id}")</strong><span>潜在奖励</span><strong>{bounty.reward} MON</strong></>}
        onClose={() => setClaimOpen(false)}
        onConfirm={() => void claimBounty(bounty.id).then(() => setClaimOpen(false)).catch(() => undefined)}
      />
    </div>
  )
}
