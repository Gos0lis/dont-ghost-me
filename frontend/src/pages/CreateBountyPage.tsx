import { ArrowLeft, Banknote, CheckCircle2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CreateBountyInput } from '../contracts/types'
import { BalanceCard } from '../components/BalanceCard'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { FormField, TextArea, TextInput } from '../components/ui/FormField'
import { PrimaryButton } from '../components/ui/Buttons'
import { useAppStore } from '../store/useAppStore'

export function CreateBountyPage() {
  const { projectId = 'monad-hackathon' } = useParams()
  const navigate = useNavigate()
  const projects = useAppStore((state) => state.projects)
  const createBounty = useAppStore((state) => state.createBounty)
  const pending = useAppStore((state) => state.pendingMethod === 'createBounty')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const project = projects.find((item) => item.id === projectId)
  const [input, setInput] = useState<CreateBountyInput>({
    projectId,
    title: '紧急完成智能合约 MVP',
    description: '原合约开发成员退出，需要完成最小可演示合约逻辑和部署说明。',
    skills: ['Solidity', 'Foundry', 'Monad'],
    deliverables: ['完成核心 Solidity 合约', '提交 GitHub 仓库链接', '提供部署地址或本地测试结果', '提供简短交接说明'],
    acceptanceCriteria: ['核心函数可以运行', '测试通过', '团队可以完成 Demo 演示'],
    deadline: '2026-08-01T23:59',
    reward: 80,
    allowMultiple: false,
    sourceMemberId: 'yunn',
  })
  const remaining = useMemo(() => (project?.rescuePool ?? 0) - input.reward, [project?.rescuePool, input.reward])
  if (!project) return <div className="page-shell">项目不存在。</div>

  return (
    <div className="page-shell bounty-create-page">
      <Link className="back-link" to={`/project/${project.id}`}><ArrowLeft size={16} />返回项目详情</Link>
      <div className="create-heading"><span className="eyebrow">RESCUE BOUNTY</span><h1>发布救场悬赏</h1><p>把 Yunn 留下的任务缺口变成清晰、可领取、可验收的救场任务。</p></div>
      <div className="bounty-create-layout">
        <section className="form-card">
          <div className="form-section">
            <div className="form-section-title"><span>⚡</span><div><h2>悬赏信息</h2><p>内容越具体，越容易找到合适的救场者。</p></div></div>
            <div className="form-grid single">
              <FormField label="悬赏标题"><TextInput value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} /></FormField>
              <FormField label="任务缺口说明"><TextArea value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} /></FormField>
              <FormField label="技能要求" hint="使用逗号分隔"><TextInput value={input.skills.join(', ')} onChange={(event) => setInput({ ...input, skills: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></FormField>
              <FormField label="交付内容" hint="每行一项"><TextArea value={input.deliverables.join('\n')} onChange={(event) => setInput({ ...input, deliverables: event.target.value.split('\n').filter(Boolean) })} /></FormField>
              <FormField label="验收标准" hint="每行一项"><TextArea value={input.acceptanceCriteria.join('\n')} onChange={(event) => setInput({ ...input, acceptanceCriteria: event.target.value.split('\n').filter(Boolean) })} /></FormField>
              <div className="form-grid">
                <FormField label="截止时间"><TextInput type="datetime-local" value={input.deadline} onChange={(event) => setInput({ ...input, deadline: event.target.value })} /></FormField>
                <FormField label="奖励金额（MON）"><TextInput type="number" max={project.rescuePool} value={input.reward} onChange={(event) => setInput({ ...input, reward: Number(event.target.value) })} /></FormField>
              </div>
              <label className="toggle-row"><input type="checkbox" checked={input.allowMultiple} onChange={(event) => setInput({ ...input, allowMultiple: event.target.checked })} /><span /><div><strong>允许多人领取</strong><small>当前建议单人领取，以便快速验收结算。</small></div></label>
            </div>
          </div>
        </section>
        <aside className="bounty-funds">
          <img src="/assets/pigeons/pigeon-builder-laptop.png" alt="" />
          <span className="eyebrow">资金来自违约保证金</span>
          <h2>救场池分配预览</h2>
          <div className="bounty-balance-stack">
            <BalanceCard label="当前救场池" value={project.rescuePool} unit="MON" accent="orange" />
            <BalanceCard label="本次悬赏" value={input.reward} unit="MON" />
            <BalanceCard label="发布后剩余" value={remaining} unit="MON" accent={remaining < 0 ? 'red' : 'green'} />
          </div>
          <div className="fund-note"><CheckCircle2 size={18} /><p>该奖励来自 Yunn 的 100 MON 违约保证金，原团队成员无需额外支付。</p></div>
          <PrimaryButton disabled={remaining < 0 || input.reward <= 0} icon={<Banknote size={17} />} onClick={() => setConfirmOpen(true)}>发布 80 MON 悬赏</PrimaryButton>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="确认发布救场悬赏？"
        description={`将从项目救场池预留 ${input.reward} MON，悬赏发布后全网救场者可以领取。`}
        confirmLabel="确认并发布"
        loading={pending}
        details={<><span>合约方法</span><strong>createBounty(projectId, bounty)</strong><span>预留奖励</span><strong>{input.reward} MON</strong></>}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void createBounty(input).then(() => navigate('/bounty/smart-contract-mvp')).catch(() => undefined)}
      />
    </div>
  )
}
