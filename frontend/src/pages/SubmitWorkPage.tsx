import { ArrowLeft, CircleCheck, GitBranch, HeartCrack, Link2, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { FormField, TextArea, TextInput } from '../components/ui/FormField'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { useAppStore } from '../store/useAppStore'

export function SubmitWorkPage() {
  const { bountyId = '' } = useParams()
  const navigate = useNavigate()
  const bounty = useAppStore((state) => state.bounties.find((item) => item.id === bountyId))
  const submitWork = useAppStore((state) => state.submitWork)
  const cancelBountyClaim = useAppStore((state) => state.cancelBountyClaim)
  const pending = useAppStore((state) => state.pendingMethod === 'submitWork')
  const cancelling = useAppStore((state) => state.pendingMethod === 'cancelBountyClaim')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [form, setForm] = useState({
    githubUrl: 'https://github.com/demo/dont-ghost-me-contract',
    demoUrl: 'https://testnet.monad.xyz/address/0x1234...5678',
    summary: '已完成核心合约逻辑，包括创建项目、保证金记录、退出处理、创建悬赏和验收结算。',
    testNotes: '所有核心测试已通过，覆盖正常退出、悬赏领取、成果验收和奖励支付流程。',
    handoverNotes: '已在 README 中说明调用方法、函数功能和部署步骤。',
  })
  if (!bounty) return <div className="page-shell">悬赏不存在。</div>
  return (
    <div className="page-shell submit-page">
      <Link className="back-link" to={`/bounty/${bounty.id}`}><ArrowLeft size={16} />返回悬赏详情</Link>
      <div className="submit-layout">
        <section>
          <div className="create-heading"><span className="eyebrow">SUBMIT WORK</span><h1>提交救场成果</h1><p>把可验证的交付物写入模拟链上记录，等待原团队验收。</p></div>
          {bounty.revisionFeedback && <div className="revision-banner"><strong>请根据团队反馈修改</strong><p>{bounty.revisionFeedback}</p></div>}
          <div className="form-card">
            <div className="form-grid single">
              <FormField label="GitHub 仓库链接"><div className="icon-input"><GitBranch size={17} /><TextInput value={form.githubUrl} onChange={(event) => setForm({ ...form, githubUrl: event.target.value })} /></div></FormField>
              <FormField label="部署地址或演示链接"><div className="icon-input"><Link2 size={17} /><TextInput value={form.demoUrl} onChange={(event) => setForm({ ...form, demoUrl: event.target.value })} /></div></FormField>
              <FormField label="成果说明"><TextArea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></FormField>
              <FormField label="测试结果说明"><TextArea value={form.testNotes} onChange={(event) => setForm({ ...form, testNotes: event.target.value })} /></FormField>
              <FormField label="交接说明"><TextArea value={form.handoverNotes} onChange={(event) => setForm({ ...form, handoverNotes: event.target.value })} /></FormField>
            </div>
            <div className="submit-form-actions">
              <PrimaryButton icon={<Send size={17} />} onClick={() => setConfirmOpen(true)}>提交成果等待验收</PrimaryButton>
              <SecondaryButton className="danger-outline" icon={<HeartCrack size={17} />} onClick={() => setCancelOpen(true)}>狠心放弃任务</SecondaryButton>
            </div>
          </div>
        </section>
        <aside className="submit-aside">
          <div className="submission-art"><img src="/assets/pigeons/pigeon-empty-box.png" alt="" /></div>
          <span className="eyebrow">当前救场任务</span><h2>{bounty.title}</h2>
          <div className="submission-checks">
            {['链接可以正常访问', '成果说明足够清晰', '测试结果已记录', '交接信息完整'].map((item) => <span key={item}><CircleCheck size={17} />{item}</span>)}
          </div>
          <div className="reward-preview"><span>通过验收后到账</span><strong>{bounty.reward} MON</strong></div>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="确认提交救场成果？"
        description="提交后悬赏将进入等待验收状态，原团队可以查看成果并决定通过或要求修改。"
        confirmLabel="签名并提交成果"
        loading={pending}
        details={<><span>合约方法</span><strong>submitWork(bountyId, metadata)</strong><span>目标状态</span><strong>等待验收</strong></>}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void submitWork(bounty.id, form).then(() => navigate(`/bounty/${bounty.id}`)).catch(() => undefined)}
      />
      <ConfirmDialog
        open={cancelOpen}
        danger
        title="确认狠心放弃这个救场任务？"
        description="放弃后，本次领取关系会解除，悬赏重新回到大厅，其他外部救场者可以再次领取。奖励资金仍保留在救场池中。"
        confirmLabel="确认放弃并重新开放"
        loading={cancelling}
        details={<><span>合约方法</span><strong>cancelBountyClaim(bountyId)</strong><span>目标状态</span><strong>重新开放领取</strong></>}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void cancelBountyClaim(bounty.id).then(() => navigate(`/bounty/${bounty.id}`)).catch(() => undefined)}
      />
    </div>
  )
}
