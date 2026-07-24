import { ArrowLeft, CheckCircle2, ExternalLink, GitBranch, MessageSquareWarning, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { FormField, TextArea } from '../components/ui/FormField'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../utils/format'

const checklist = ['核心功能已经完成', '成果可以运行', '代码已经提交', '已提供交接说明']

export function ReviewPage() {
  const { projectId = '', bountyId = '' } = useParams()
  const navigate = useNavigate()
  const bounty = useAppStore((state) => state.bounties.find((item) => item.id === bountyId))
  const approveAndPay = useAppStore((state) => state.approveAndPay)
  const requestRevision = useAppStore((state) => state.requestRevision)
  const pendingMethod = useAppStore((state) => state.pendingMethod)
  const [checked, setChecked] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [feedback, setFeedback] = useState('请补充部署脚本说明，并在 README 中标注 Monad 测试网配置。')
  const allChecked = useMemo(() => checklist.every((item) => checked.includes(item)), [checked])
  if (!bounty || !bounty.submission) return <div className="page-shell">尚未找到可验收的成果。</div>
  const submission = bounty.submission

  return (
    <div className="page-shell review-page">
      <Link className="back-link" to={`/project/${projectId}`}><ArrowLeft size={16} />返回项目详情</Link>
      <div className="create-heading"><span className="eyebrow">REVIEW & SETTLEMENT</span><h1>验收救场成果</h1><p>逐项检查 Builder 07 的交付，通过后由假合约完成奖励支付。</p></div>
      <div className="review-layout">
        <div className="review-main">
          <section className="panel rescuer-card"><span className="eyebrow">救场者信息</span><div><span className="member-avatar">B7</span><div><h2>{bounty.rescuerName}</h2><p>{shortenAddress(bounty.rescuerAddress)}</p></div><UserRound size={22} /></div></section>
          <section className="panel submission-card">
            <span className="eyebrow">提交内容</span><h2>{bounty.title}</h2>
            <div className="submission-links"><a href={submission.githubUrl} target="_blank" rel="noreferrer"><GitBranch size={17} />GitHub 仓库<ExternalLink size={14} /></a><a href={submission.demoUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} />部署或演示地址<ExternalLink size={14} /></a></div>
            {[['成果说明', submission.summary], ['测试结果', submission.testNotes], ['交接说明', submission.handoverNotes]].map(([title, content]) => <div className="submission-section" key={title}><strong>{title}</strong><p>{content}</p></div>)}
          </section>
        </div>
        <aside className="review-aside">
          <section className="panel review-checklist">
            <span className="eyebrow">验收标准</span><h2>确认交付质量</h2><p>全部勾选后才能验收并支付。</p>
            {checklist.map((item) => (
              <label key={item} className={checked.includes(item) ? 'checked' : ''}>
                <input type="checkbox" checked={checked.includes(item)} onChange={(event) => setChecked((items) => event.target.checked ? [...items, item] : items.filter((value) => value !== item))} />
                <span><CheckCircle2 size={17} /></span>{item}
              </label>
            ))}
            <div className="payment-total"><span>本次支付</span><strong>{bounty.reward} MON</strong><small>支付给 {bounty.rescuerName}</small></div>
            <PrimaryButton disabled={!allChecked} icon={<ShieldCheck size={17} />} onClick={() => setConfirmOpen(true)}>验收通过并支付奖励</PrimaryButton>
            <SecondaryButton icon={<MessageSquareWarning size={17} />} onClick={() => setRevisionOpen(true)}>要求修改</SecondaryButton>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={`验收通过并支付 ${bounty.reward} MON？`}
        description="确认后奖励将进入 Builder 07 的模拟钱包，项目状态恢复为继续进行。"
        confirmLabel="确认验收并支付"
        loading={pendingMethod === 'approveAndPay'}
        details={<><span>合约方法</span><strong>approveAndPay("{bounty.id}")</strong><span>救场池变化</span><strong>100 → 20 MON</strong></>}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void approveAndPay(bounty.id).then(() => navigate('/settlement-success')).catch(() => undefined)}
      />
      {revisionOpen && (
        <div className="modal-backdrop" onMouseDown={() => setRevisionOpen(false)}>
          <section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <span className="eyebrow">REVISION REQUIRED</span><h2>向救场者发送修改意见</h2><p>悬赏状态将变为“需要修改”，Builder 07 可以重新提交。</p>
            <FormField label="修改意见"><TextArea value={feedback} onChange={(event) => setFeedback(event.target.value)} /></FormField>
            <div className="modal-actions"><SecondaryButton onClick={() => setRevisionOpen(false)}>取消</SecondaryButton><PrimaryButton loading={pendingMethod === 'requestRevision'} onClick={() => void requestRevision(bounty.id, feedback).then(() => navigate(`/bounty/${bounty.id}`)).catch(() => undefined)}>提交修改意见</PrimaryButton></div>
          </section>
        </div>
      )}
    </div>
  )
}
