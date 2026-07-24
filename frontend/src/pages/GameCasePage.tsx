import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Gamepad2,
  Play,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BalanceCard } from '../components/BalanceCard'
import { BountyCard } from '../components/BountyCard'
import { MemberCard } from '../components/MemberCard'
import { Timeline } from '../components/Timeline'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { StatusBadge } from '../components/ui/StatusBadge'
import type { ProjectStatus } from '../contracts/types'
import { GAME_PROJECT_ID } from '../data/mockData'
import { useAppStore } from '../store/useAppStore'

const replayStates: Array<{
  label: string
  progress: number
  locked: number
  rescue: number
  paid: number
  status: ProjectStatus
}> = [
  { label: '创建战队承诺', progress: 5, locked: 0, rescue: 0, paid: 0, status: 'awaiting_confirmation' },
  { label: '五人锁定 250 MON', progress: 20, locked: 250, rescue: 0, paid: 0, status: 'active' },
  { label: 'Kai 退出，50 MON 进入救场池', progress: 35, locked: 200, rescue: 50, paid: 0, status: 'rescue_needed' },
  { label: '发布两项救场悬赏', progress: 45, locked: 200, rescue: 50, paid: 0, status: 'rescue_needed' },
  { label: 'Yunn 领取补位任务', progress: 60, locked: 200, rescue: 50, paid: 0, status: 'rescue_in_progress' },
  { label: '替补与训练成果提交', progress: 72, locked: 200, rescue: 50, paid: 0, status: 'rescue_in_progress' },
  { label: '验收通过，支付 50 MON', progress: 90, locked: 200, rescue: 0, paid: 50, status: 'active_again' },
  { label: '完成比赛，解锁剩余保证金', progress: 100, locked: 0, rescue: 0, paid: 50, status: 'completed' },
]

export function GameCasePage() {
  const projects = useAppStore((state) => state.projects)
  const bounties = useAppStore((state) => state.bounties)
  const [step, setStep] = useState(replayStates.length - 1)
  const [playing, setPlaying] = useState(false)
  const project = projects.find((item) => item.id === GAME_PROJECT_ID)
  const gameBounties = useMemo(
    () => bounties.filter((bounty) => bounty.projectId === GAME_PROJECT_ID),
    [bounties],
  )

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= replayStates.length - 1) {
          window.clearInterval(timer)
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, 850)
    return () => window.clearInterval(timer)
  }, [playing])

  if (!project) return <div className="page-shell">游戏案例正在同步，请稍后刷新。</div>
  const snapshot = replayStates[step]
  const visibleEvents = project.timeline.slice(0, step + 1)

  const startReplay = () => {
    setStep(0)
    setPlaying(true)
  }

  return (
    <div className="game-case-page">
      <div className="page-shell">
        <Link className="back-link" to="/"><ArrowLeft size={16} />返回首页</Link>

        <div className="scene-switch">
          <Link to="/project/monad-hackathon"><span>01</span><strong>黑客松协作</strong><small>亲手完成救场</small></Link>
          <Link to="/travel"><span>02</span><strong>朋友旅行</strong><small>拆分补救奖励</small></Link>
          <Link className="active" to="/game-case"><span>03</span><strong>游戏组队</strong><small>已完成案例回放</small></Link>
        </div>

        <section className="game-hero">
          <div className="game-hero-copy">
            <span className="game-kicker"><Gamepad2 size={16} />第三个完整应用场景 · 已完成</span>
            <div className="game-title-row"><h1>队友赛前鸽了，<br />还能准时开黑吗？</h1><StatusBadge status={snapshot.status} /></div>
            <p>Kai 临时退出后，他的 50 MON 没有被队友瓜分，而是雇来 Yunn 补位、完成阵容交接和赛前训练。</p>
            <div className="game-hero-actions">
              <PrimaryButton
                icon={playing ? <RefreshCw size={17} className="animate-spin" /> : <Play size={17} />}
                disabled={playing}
                onClick={startReplay}
              >
                {playing ? '正在回放链上过程' : '回放完整救场过程'}
              </PrimaryButton>
              <Link to={`/project/${GAME_PROJECT_ID}`}><SecondaryButton>查看最终项目档案</SecondaryButton></Link>
            </div>
          </div>
          <div className="game-stage">
            <div className="game-orbit orbit-one" />
            <div className="game-orbit orbit-two" />
            <div className="game-controller"><Gamepad2 size={92} /></div>
            <div className="game-player player-one">C</div>
            <div className="game-player player-two">Y</div>
            <div className="game-player player-three">J</div>
            <div className="game-player player-four">北</div>
            <div className={`game-player player-five ${step >= 4 ? 'rescued' : ''}`}>{step >= 4 ? 'Y' : '?'}</div>
            <div className="game-result-chip"><Trophy size={17} /><span>{step === 7 ? '挑战赛顺利完成' : snapshot.label}</span></div>
          </div>
        </section>

        <section className="replay-console">
          <div className="replay-console-head">
            <div><span>链上过程回放</span><strong>{String(step + 1).padStart(2, '0')} / 08 · {snapshot.label}</strong></div>
            <span>{snapshot.progress}%</span>
          </div>
          <div className="replay-track">
            {replayStates.map((state, index) => (
              <button
                className={index <= step ? 'active' : ''}
                key={state.label}
                onClick={() => {
                  setPlaying(false)
                  setStep(index)
                }}
                aria-label={`查看步骤 ${index + 1}：${state.label}`}
              >
                <span>{index + 1}</span><small>{state.label}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="game-balance-grid">
          <BalanceCard label="战队总保证金" value={250} unit="MON" icon={<ShieldCheck size={20} />} />
          <BalanceCard label="当前锁定" value={snapshot.locked} unit="MON" accent="green" icon={<UsersRound size={20} />} />
          <BalanceCard label="救场悬赏池" value={snapshot.rescue} unit="MON" accent="orange" icon={<CircleDollarSign size={20} />} />
          <BalanceCard label="已支付救场者" value={snapshot.paid} unit="MON" accent="red" icon={<Banknote size={20} />} />
        </section>

        <section className="game-story-grid">
          <div className="panel game-timeline-panel">
            <div className="panel-title"><div><span className="eyebrow">实时变化</span><h2>交易与项目时间线</h2></div><span className="live-indicator"><i /> BLOCK REPLAY</span></div>
            <Timeline events={visibleEvents} />
          </div>
          <div className="panel game-outcome-panel">
            <div className="panel-title"><div><span className="eyebrow">最终结果</span><h2>违约资金真正解决了什么</h2></div><Trophy size={23} /></div>
            <div className="outcome-list">
              <div className={step >= 4 ? 'done' : ''}><CheckCircle2 size={18} /><div><strong>辅助位替补到位</strong><p>Yunn 接替 Kai，阵容恢复为五人。</p></div><b>30 MON</b></div>
              <div className={step >= 5 ? 'done' : ''}><CheckCircle2 size={18} /><div><strong>完成交接与训练</strong><p>英雄池、战术和两场训练记录全部交付。</p></div><b>20 MON</b></div>
              <div className={step >= 7 ? 'done' : ''}><Trophy size={18} /><div><strong>战队完成挑战赛</strong><p>其余成员保证金解锁，项目正式完成。</p></div><b>100%</b></div>
            </div>
          </div>
        </section>

        {step >= 6 && (
          <section className="game-paid-section">
            <div className="section-heading"><div><span className="eyebrow">已结算悬赏</span><h2>两笔奖励均有付款凭证</h2><p>点击卡片可以查看资金来源、救场者和最终状态。</p></div></div>
            <div className="game-bounty-grid">{gameBounties.map((bounty) => <BountyCard bounty={bounty} key={bounty.id} compact />)}</div>
          </section>
        )}

        {step === 7 && (
          <section className="panel game-members">
            <div className="panel-title"><div><span className="eyebrow">最终阵容档案</span><h2>项目结束后的成员状态</h2></div><UsersRound size={22} /></div>
            <div className="member-list">{project.members.map((member) => <MemberCard member={member} key={member.id} />)}</div>
          </section>
        )}
      </div>
    </div>
  )
}
