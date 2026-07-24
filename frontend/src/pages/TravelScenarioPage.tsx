import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BusFront,
  CheckCircle2,
  CircleDollarSign,
  Hotel,
  LockKeyhole,
  Plane,
  Route,
  Ticket,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceCard } from '../components/BalanceCard'
import { MemberCard } from '../components/MemberCard'
import { Timeline } from '../components/Timeline'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { CreateBountyInput } from '../contracts/types'
import { TRAVEL_PROJECT_ID } from '../data/mockData'
import { useAppStore } from '../store/useAppStore'

const rescueTasks = [
  {
    icon: UserPlus,
    reward: 40,
    title: '寻找替补同行者',
    description: '找到一位时间、预算和出行计划匹配的替补，并完成团队确认。',
    skills: ['旅行协调', '沟通'],
    deliverables: ['替补同行确认', '费用与任务交接记录'],
    acceptanceCriteria: ['五位同行者确认', '替补接受原有行程和预算'],
  },
  {
    icon: Ticket,
    reward: 40,
    title: '转卖闲置门票',
    description: '将 Yunn 名下无法退订的景点门票合规转让，减少团队损失。',
    skills: ['票务', '闲置交易'],
    deliverables: ['买家付款凭证', '门票转让记录'],
    acceptanceCriteria: ['门票成功转让', '款项与买家信息可核验'],
  },
  {
    icon: Hotel,
    reward: 20,
    title: '修改酒店与行程',
    description: '同步修改酒店入住信息、人数和每日路线，确保其余成员顺利出发。',
    skills: ['酒店协调', '行程规划'],
    deliverables: ['酒店订单修改凭证', '新版旅行行程'],
    acceptanceCriteria: ['酒店确认修改', '团队确认新版行程'],
  },
] as const

export function TravelScenarioPage() {
  const [quitOpen, setQuitOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const projects = useAppStore((state) => state.projects)
  const bounties = useAppStore((state) => state.bounties)
  const wallet = useAppStore((state) => state.wallet)
  const quitProject = useAppStore((state) => state.quitProject)
  const createBounty = useAppStore((state) => state.createBounty)
  const batchResolveBounties = useAppStore((state) => state.batchResolveBounties)
  const completeProject = useAppStore((state) => state.completeProject)
  const notify = useAppStore((state) => state.notify)
  const pendingMethod = useAppStore((state) => state.pendingMethod)

  const project = projects.find((item) => item.id === TRAVEL_PROJECT_ID)
  const travelBounties = useMemo(
    () => bounties.filter((item) => item.projectId === TRAVEL_PROJECT_ID),
    [bounties],
  )
  const yunn = project?.members.find((member) => member.id === 'yunn')
  const hasQuit = yunn?.status === 'quit'
  const allPublished = travelBounties.length >= rescueTasks.length
  const allResolved = allPublished && travelBounties.every((bounty) => bounty.status === 'paid')
  const isCompleted = project?.status === 'completed'

  if (!project) return <div className="page-shell">旅行场景正在同步，请稍后刷新。</div>

  const requireCaro = () => {
    if (!wallet.isConnected) {
      notify('info', '请先连接钱包', '使用右上角按钮连接模拟钱包后再发起交易')
      return false
    }
    if (wallet.account?.role !== 'initiator') {
      notify('info', '请切换到 Caro', '该操作需要旅行发起人签名；手机端可在钱包菜单中切换')
      return false
    }
    return true
  }

  const publishAll = async () => {
    if (!requireCaro()) return
    setIsPublishing(true)
    try {
      for (const task of rescueTasks) {
        if (travelBounties.some((bounty) => bounty.title === task.title)) continue
        const input: CreateBountyInput = {
          projectId: TRAVEL_PROJECT_ID,
          title: task.title,
          description: task.description,
          skills: [...task.skills],
          deliverables: [...task.deliverables],
          acceptanceCriteria: [...task.acceptanceCriteria],
          deadline: '2026-08-10T12:00:00.000Z',
          reward: task.reward,
          allowMultiple: false,
          sourceMemberId: 'yunn',
        }
        await createBounty(input)
      }
      setPublishOpen(false)
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="travel-demo-page">
      <div className="page-shell">
        <Link className="back-link" to="/"><ArrowLeft size={16} />返回首页</Link>

        <div className="scene-switch">
          <Link to="/project/monad-hackathon"><span>01</span><strong>黑客松协作</strong><small>开发者中途退出</small></Link>
          <Link className="active" to="/travel"><span>02</span><strong>朋友旅行</strong><small>同行者临时鸽了</small></Link>
          <Link to="/game-case"><span>03</span><strong>游戏组队</strong><small>已完成案例回放</small></Link>
        </div>

        <section className="travel-demo-hero">
          <div>
            <span className="travel-kicker"><Plane size={15} />第二个完整应用场景</span>
            <div className="travel-title-row"><h1>五人旅行，<br />有人临时鸽了怎么办？</h1><StatusBadge status={project.status} /></div>
            <p>退出者的保证金不直接平均赔给其他人，而是雇人解决他制造的问题：找替补、转门票、改酒店和重新协调行程。</p>
            <blockquote>你可以鸽，但你的钱会雇别人来救场。</blockquote>
            <div className="travel-hero-actions">
              {!hasQuit ? (
                <PrimaryButton icon={<Plane size={17} />} onClick={() => requireCaro() && setQuitOpen(true)}>
                  模拟 Yunn 临时退出
                </PrimaryButton>
              ) : !allPublished ? (
                <PrimaryButton icon={<CircleDollarSign size={17} />} onClick={() => requireCaro() && setPublishOpen(true)}>
                  将 100 MON 拆成 3 个悬赏
                </PrimaryButton>
              ) : !allResolved ? (
                <PrimaryButton icon={<CheckCircle2 size={17} />} onClick={() => requireCaro() && setResolveOpen(true)}>
                  现场快速完成三项补救
                </PrimaryButton>
              ) : !isCompleted ? (
                <PrimaryButton icon={<CheckCircle2 size={17} />} onClick={() => requireCaro() && setCompleteOpen(true)}>
                  完成旅行并结算
                </PrimaryButton>
              ) : (
                <Link to="/game-case"><PrimaryButton>进入游戏案例 <ArrowRight size={16} /></PrimaryButton></Link>
              )}
              <Link to={`/project/${TRAVEL_PROJECT_ID}`}><SecondaryButton>查看标准项目页</SecondaryButton></Link>
            </div>
          </div>
          <div className="travel-hero-art">
            <div className="travel-route-line" />
            <div className="travel-art-icon travel-art-plane"><Plane /></div>
            <div className="travel-art-icon travel-art-hotel"><Hotel /></div>
            <div className="travel-art-icon travel-art-bus"><BusFront /></div>
            <img src="/assets/pigeons/pigeon-empty-box.png" alt="准备出发的紫色鸽子" />
            <div className="travel-pass"><small>KYOTO TRIP</small><strong>5 → {hasQuit ? '4 + 1' : '5'}</strong><span>{hasQuit ? '等待救场' : '共同出发'}</span></div>
          </div>
        </section>

        <div className={`demo-next-step ${isCompleted ? 'complete' : ''}`}>
          <span>现场演示指引</span>
          <strong>{!hasQuit ? '下一步：Caro 确认 Yunn 临时退出' : !allPublished ? '下一步：将 100 MON 拆成三项悬赏' : !allResolved ? '下一步：快速模拟三项补救完成并付款' : !isCompleted ? '下一步：完成旅行项目并解锁保证金' : '旅行救场完整闭环已完成'}</strong>
          <small>当前身份：{wallet.account?.name ?? '未连接钱包'} · 操作身份需要 Caro</small>
        </div>

        <section className="travel-story">
          <div className="travel-step done"><span>01</span><LockKeyhole size={20} /><div><strong>五人先承诺</strong><p>每人锁定 100 MON，并认领旅行任务。</p></div></div>
          <div className={`travel-step ${hasQuit ? 'danger' : ''}`}><span>02</span><Plane size={20} /><div><strong>Yunn 临时退出</strong><p>{hasQuit ? '100 MON 已进入补救悬赏池。' : '点击上方按钮模拟链上退出交易。'}</p></div></div>
          <div className={`travel-step ${allPublished ? 'done' : ''}`}><span>03</span><Banknote size={20} /><div><strong>谁解决谁拿钱</strong><p>{allPublished ? '三个补救悬赏已在大厅公开发布。' : '将资金精确奖励给完成补救的人。'}</p></div></div>
        </section>

        <section className="travel-balance-grid">
          <BalanceCard label="旅行总保证金" value={project.totalDeposit} unit="MON" icon={<LockKeyhole size={20} />} />
          <BalanceCard label="仍在锁定" value={project.lockedDeposit} unit="MON" accent="green" icon={<UsersRound size={20} />} />
          <BalanceCard label="补救悬赏池" value={project.rescuePool} unit="MON" accent="orange" icon={<CircleDollarSign size={20} />} />
          <BalanceCard label="已预留奖励" value={project.reservedBounty} unit="MON" accent="red" icon={<Banknote size={20} />} />
        </section>

        {hasQuit && (
          <section className="travel-rescue-section">
            <div className="section-heading">
              <div><span className="eyebrow">100 MON 怎么花</span><h2>用钱恢复协作，而不是制造内耗</h2><p>每一笔奖励对应一个可验收的补救结果。</p></div>
              {!allPublished && <button className="text-link" onClick={() => requireCaro() && setPublishOpen(true)}>一键发布三项悬赏 <ArrowRight size={15} /></button>}
            </div>
            <div className="travel-rescue-grid">
              {rescueTasks.map(({ icon: Icon, ...task }) => {
                const bounty = travelBounties.find((item) => item.title === task.title)
                return (
                  <article className={bounty ? 'published' : ''} key={task.title}>
                    <div className="travel-task-icon"><Icon size={22} /></div>
                    <span className="travel-task-reward">{task.reward} MON</span>
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                    <div className="travel-task-status">
                      {bounty?.status === 'paid' ? <><CheckCircle2 size={15} />已完成并支付</> : bounty ? <><CheckCircle2 size={15} />已发布到救场大厅</> : <>等待发布</>}
                    </div>
                    {bounty && <Link to={`/bounty/${bounty.id}`}>查看并领取 <ArrowRight size={14} /></Link>}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        <section className="travel-detail-grid">
          <div className="panel">
            <div className="panel-title"><div><span className="eyebrow">旅行小队</span><h2>五人任务与保证金</h2></div><UsersRound size={22} /></div>
            <div className="member-list">{project.members.map((member) => <MemberCard key={member.id} member={member} />)}</div>
          </div>
          <div className="panel">
            <div className="panel-title"><div><span className="eyebrow">链上记录</span><h2>旅行承诺时间线</h2></div><Route size={22} /></div>
            <Timeline events={project.timeline} />
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={quitOpen}
        title="确认 Yunn 临时退出旅行？"
        description="交易成功后，Yunn 锁定的 100 MON 不会平分给朋友，而会进入旅行补救悬赏池。"
        confirmLabel="确认退出并转入补救池"
        danger
        loading={pendingMethod === 'quitProject'}
        details={<><span>合约方法</span><strong>quitProject("five-friends-trip", "yunn")</strong><span>转入补救池</span><strong>100 MON</strong></>}
        onClose={() => setQuitOpen(false)}
        onConfirm={() => void quitProject(TRAVEL_PROJECT_ID, 'yunn').then(() => setQuitOpen(false)).catch(() => undefined)}
      />
      <ConfirmDialog
        open={publishOpen}
        title="发布三项旅行补救悬赏？"
        description="系统将依次执行三笔模拟链上交易，把 Yunn 的 100 MON 分配为 40、40、20 MON 三个可领取任务。"
        confirmLabel="确认发布 40 + 40 + 20 MON"
        loading={isPublishing}
        details={<><span>合约方法</span><strong>createBounty() × 3</strong><span>奖励总额</span><strong>100 MON</strong></>}
        onClose={() => !isPublishing && setPublishOpen(false)}
        onConfirm={() => void publishAll()}
      />
      <ConfirmDialog
        open={resolveOpen}
        title="快速模拟三项旅行补救全部完成？"
        description="适合现场演示：一笔批量交易将模拟领取、提交、验收和付款，三个悬赏会同步更新为已支付。"
        confirmLabel="确认完成并支付 100 MON"
        loading={pendingMethod === 'batchResolveBounties'}
        details={<><span>合约方法</span><strong>batchResolveBounties(projectId)</strong><span>支付奖励</span><strong>40 + 40 + 20 MON</strong></>}
        onClose={() => setResolveOpen(false)}
        onConfirm={() => void batchResolveBounties(TRAVEL_PROJECT_ID).then(() => setResolveOpen(false)).catch(() => undefined)}
      />
      <ConfirmDialog
        open={completeOpen}
        title="完成旅行并结算保证金？"
        description="补救已经完成。确认后旅行项目将变为已完成，其余四位成员的 400 MON 保证金会解锁。"
        confirmLabel="完成旅行并结算"
        loading={pendingMethod === 'completeProject'}
        details={<><span>合约方法</span><strong>completeProject(projectId)</strong><span>解锁保证金</span><strong>{project.lockedDeposit} MON</strong></>}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => void completeProject(TRAVEL_PROJECT_ID).then(() => setCompleteOpen(false)).catch(() => undefined)}
      />
    </div>
  )
}
