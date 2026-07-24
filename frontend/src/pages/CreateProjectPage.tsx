import { ArrowLeft, ArrowRight, CheckCircle2, Plus, Trash2, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { CreateProjectInput } from '../contracts/types'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { FormField, TextArea, TextInput } from '../components/ui/FormField'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { Stepper } from '../components/Stepper'
import { useAppStore } from '../store/useAppStore'

const defaultInput: CreateProjectInput = {
  name: 'Monad 黑客松作品开发',
  description: '团队需要在截止日前完成产品设计、前端 Demo、智能合约、视觉方案和路演材料。',
  category: 'Web3 黑客松',
  goal: '在提交截止前完成一个可演示、可串联的 Web3 产品',
  startDate: '2026-07-24',
  deadline: '2026-08-02',
  members: [
    { name: 'Caro', address: '0x71A4C0A07123982F3', role: '产品统筹与前端', task: '完成产品设计、前端 Demo 和整体串联', taskDeadline: '2026-08-01', deposit: 100 },
    { name: 'Yunn', address: '0x8A26B64713D3E109F', role: '智能合约开发', task: '完成核心合约逻辑与测试', taskDeadline: '2026-07-31', deposit: 100 },
    { name: 'Yoyo', address: '0x492817354A7D3E22', role: '视觉设计', task: '完成 Logo、配色、插画和页面视觉方案', taskDeadline: '2026-07-30', deposit: 60 },
    { name: 'Jimmy', address: '0x63D21A5B8413CA90', role: '运营与路演', task: '完成项目调研、商业逻辑和路演材料', taskDeadline: '2026-08-01', deposit: 60 },
    { name: '北海', address: '0xB3E1A18F93D20561', role: '测试与交付', task: '完成产品测试、问题记录和最终验收', taskDeadline: '2026-08-02', deposit: 60 },
  ],
}

const rules = [
  '成员退出后，保证金进入救场悬赏池',
  '团队可以将遗留任务拆分并发布为救场悬赏',
  '救场者完成任务并通过验收后领取奖励',
  '当前 Demo 不引入复杂争议仲裁',
]

export function CreateProjectPage() {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState(defaultInput)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const navigate = useNavigate()
  const createProject = useAppStore((state) => state.createProject)
  const wallet = useAppStore((state) => state.wallet)
  const notify = useAppStore((state) => state.notify)
  const pending = useAppStore((state) => state.pendingMethod === 'createProject')
  const total = useMemo(() => input.members.reduce((sum, member) => sum + Number(member.deposit), 0), [input.members])

  const updateMember = (index: number, key: keyof CreateProjectInput['members'][number], value: string | number) => {
    setInput((current) => ({
      ...current,
      members: current.members.map((member, memberIndex) => memberIndex === index ? { ...member, [key]: value } : member),
    }))
  }

  return (
    <div className="page-shell create-page">
      <Link className="back-link" to="/"><ArrowLeft size={16} />返回首页</Link>
      <div className="create-heading"><span className="eyebrow">CREATE A PROMISE</span><h1>创建共同承诺</h1><p>把成员、分工和保证金写清楚，让团队从第一天就知道如何面对意外。</p></div>
      <Stepper steps={['基本信息', '团队成员', '承诺规则', '确认创建']} current={step} />
      <section className="form-card">
        {step === 0 && (
          <div className="form-section">
            <div className="form-section-title"><span>01</span><div><h2>项目基本信息</h2><p>告诉团队你们准备一起完成什么。</p></div></div>
            <div className="form-grid">
              <FormField label="项目名称"><TextInput value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></FormField>
              <FormField label="项目类型"><TextInput value={input.category} onChange={(event) => setInput({ ...input, category: event.target.value })} /></FormField>
              <FormField label="项目简介"><TextArea value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} /></FormField>
              <FormField label="总体目标"><TextArea value={input.goal} onChange={(event) => setInput({ ...input, goal: event.target.value })} /></FormField>
              <FormField label="开始日期"><TextInput type="date" value={input.startDate} onChange={(event) => setInput({ ...input, startDate: event.target.value })} /></FormField>
              <FormField label="截止日期"><TextInput type="date" value={input.deadline} onChange={(event) => setInput({ ...input, deadline: event.target.value })} /></FormField>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="form-section">
            <div className="form-section-title"><span>02</span><div><h2>添加团队成员</h2><p>每个人都要有明确任务和对应保证金。</p></div></div>
            <div className="member-form-list">
              {input.members.map((member, index) => (
                <article className="member-form" key={`${member.address}-${index}`}>
                  <div className="member-form-index">{index + 1}</div>
                  <div className="member-form-grid">
                    <FormField label="昵称"><TextInput value={member.name} onChange={(event) => updateMember(index, 'name', event.target.value)} /></FormField>
                    <FormField label="钱包地址"><TextInput value={member.address} onChange={(event) => updateMember(index, 'address', event.target.value as `0x${string}`)} /></FormField>
                    <FormField label="成员角色"><TextInput value={member.role} onChange={(event) => updateMember(index, 'role', event.target.value)} /></FormField>
                    <FormField label="负责任务"><TextInput value={member.task} onChange={(event) => updateMember(index, 'task', event.target.value)} /></FormField>
                    <FormField label="任务截止"><TextInput type="date" value={member.taskDeadline} onChange={(event) => updateMember(index, 'taskDeadline', event.target.value)} /></FormField>
                    <FormField label="保证金（MON）"><TextInput type="number" value={member.deposit} onChange={(event) => updateMember(index, 'deposit', Number(event.target.value))} /></FormField>
                  </div>
                  {input.members.length > 1 && <button className="remove-member" onClick={() => setInput({ ...input, members: input.members.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16} /></button>}
                </article>
              ))}
            </div>
            <SecondaryButton icon={<Plus size={16} />} onClick={() => setInput({ ...input, members: [...input.members, { name: '新成员', address: '0x0000000000000000', role: '待分配', task: '待分配任务', taskDeadline: input.deadline, deposit: 60 }] })}>添加成员</SecondaryButton>
          </div>
        )}
        {step === 2 && (
          <div className="form-section">
            <div className="form-section-title"><span>03</span><div><h2>承诺与救场规则</h2><p>所有成员在加入前都会看到这些规则。</p></div></div>
            <div className="rule-list">
              {rules.map((rule) => <div key={rule}><CheckCircle2 size={20} /><div><strong>{rule}</strong><p>规则将作为共同承诺的一部分写入模拟链上记录。</p></div></div>)}
            </div>
            <div className="rule-note">本项目只模拟链上交互，不会锁定真实资产。未来可直接替换为 Wagmi / Viem 合约调用。</div>
          </div>
        )}
        {step === 3 && (
          <div className="form-section">
            <div className="form-section-title"><span>04</span><div><h2>确认并创建</h2><p>最后核对一次项目、成员和资金安排。</p></div></div>
            <div className="summary-card">
              <div><span>项目</span><strong>{input.name}</strong><small>{input.goal}</small></div>
              <div className="summary-stats">
                <span><strong>{input.members.length}</strong><small>团队成员</small></span>
                <span><strong>{total}</strong><small>MON 总保证金</small></span>
                <span><strong>{input.deadline}</strong><small>项目截止日</small></span>
              </div>
            </div>
            <div className="summary-members">{input.members.map((member) => <div key={member.address}><span className="member-avatar">{member.name.slice(0, 1)}</span><span><strong>{member.name}</strong><small>{member.role} · {member.task}</small></span><b>{member.deposit} MON</b></div>)}</div>
          </div>
        )}
        <div className="form-navigation">
          <SecondaryButton disabled={step === 0} onClick={() => setStep((value) => value - 1)}>上一步</SecondaryButton>
          {step < 3 ? (
            <PrimaryButton onClick={() => setStep((value) => value + 1)}>下一步 <ArrowRight size={16} /></PrimaryButton>
          ) : (
            <PrimaryButton icon={<UsersRound size={17} />} onClick={() => {
              if (!wallet.isConnected) {
                notify('info', '请先连接钱包', '创建共同承诺需要钱包签名')
                return
              }
              setConfirmOpen(true)
            }}>创建并发起确认</PrimaryButton>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={confirmOpen}
        title="确认创建共同承诺？"
        description={`将创建“${input.name}”，并为 ${input.members.length} 名成员记录共 ${total} MON 保证金。`}
        confirmLabel="签名并创建"
        loading={pending}
        details={<><span>合约方法</span><strong>createProject(project)</strong><span>模拟锁定</span><strong>{total} MON</strong></>}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void createProject(input).then(() => navigate('/projects')).catch(() => undefined)}
      />
    </div>
  )
}
