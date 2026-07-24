import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Code2,
  LockKeyhole,
  RefreshCw,
  Rocket,
  UserRoundX,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { StatusBadge } from '../components/ui/StatusBadge'
import { DEMO_PROJECT_ID } from '../data/mockData'
import { useAppStore } from '../store/useAppStore'

export function HackathonScenarioPage() {
  const navigate = useNavigate()
  const [isResetting, setIsResetting] = useState(false)
  const projects = useAppStore((state) => state.projects)
  const resetDemo = useAppStore((state) => state.resetDemo)
  const wallet = useAppStore((state) => state.wallet)
  const connectWallet = useAppStore((state) => state.connectWallet)
  const switchAccount = useAppStore((state) => state.switchAccount)
  const project = projects.find((item) => item.id === DEMO_PROJECT_ID)

  if (!project) return <div className="page-shell">黑客松场景正在同步，请稍后刷新。</div>

  const resetAndEnter = async () => {
    setIsResetting(true)
    try {
      await resetDemo()
      navigate(`/project/${DEMO_PROJECT_ID}`)
    } finally {
      setIsResetting(false)
    }
  }

  const enterAsYunn = async () => {
    if (wallet.isConnected) await switchAccount('yunn')
    else await connectWallet('MetaMask', 'yunn')
    navigate(`/project/${DEMO_PROJECT_ID}`)
  }

  return (
    <div className="hackathon-demo-page">
      <div className="page-shell">
        <Link className="back-link" to="/"><ArrowLeft size={16} />返回首页</Link>

        <div className="scene-switch">
          <Link className="active" to="/hackathon"><span>01</span><strong>黑客松协作</strong><small>亲手完成救场</small></Link>
          <Link to="/travel"><span>02</span><strong>朋友旅行</strong><small>拆分补救奖励</small></Link>
          <Link to="/game-case"><span>03</span><strong>游戏组队</strong><small>已完成案例回放</small></Link>
        </div>

        <section className="hackathon-demo-hero">
          <div className="hackathon-hero-copy">
            <span className="hackathon-kicker"><Code2 size={16} />第一个完整应用场景 · 黑客松</span>
            <div className="hackathon-title-row">
              <h1>开发者中途鸽了，<br />Demo 还能按时交付吗？</h1>
              <StatusBadge status={project.status} />
            </div>
            <p>Yunn 退出后，100 MON 保证金不会被团队瓜分，而是用于雇佣新的开发者完成智能合约缺口。</p>
            <blockquote>退出不是终点，保证金会继续为团队解决问题。</blockquote>
            <div className="hackathon-hero-actions">
              <Link to={`/project/${DEMO_PROJECT_ID}`}>
                <PrimaryButton>进入项目页开始演示 <ArrowRight size={16} /></PrimaryButton>
              </Link>
              <SecondaryButton
                icon={<RefreshCw size={17} className={isResetting ? 'animate-spin' : ''} />}
                disabled={isResetting}
                onClick={() => void resetAndEnter()}
              >
                {isResetting ? '正在重置 Demo' : '重置并开始演示'}
              </SecondaryButton>
              <button className="hackathon-yunn-entry" onClick={() => void enterAsYunn()}>
                切换为 Yunn，亲自操作退出
              </button>
            </div>
          </div>
          <div className="hackathon-hero-art">
            <div className="hackathon-code-card"><code>function rescue()</code><span>任务缺口 → 公开悬赏</span></div>
            <img src="/assets/pigeons/pigeon-builder-laptop.png" alt="正在完成智能合约救场任务的紫色鸽子" />
            <div className="hackathon-rescue-chip"><Rocket size={17} /><div><span>当前救场悬赏池</span><strong>{project.rescuePool} MON</strong></div></div>
          </div>
        </section>

        <section className="travel-story hackathon-story">
          <div className="travel-step done"><span>01</span><LockKeyhole size={20} /><div><strong>五人共同承诺</strong><p>团队锁定 380 MON，并明确每个人的交付任务。</p></div></div>
          <div className="travel-step danger"><span>02</span><UserRoundX size={20} /><div><strong>Yunn 中途退出</strong><p>他的 100 MON 保证金自动进入救场悬赏池。</p></div></div>
          <div className="travel-step"><span>03</span><Banknote size={20} /><div><strong>救场后继续推进</strong><p>新开发者提交成果、通过验收，项目继续完成阶段与结算。</p></div></div>
        </section>

        <div className="hackathon-flow-note">
          <CheckCircle2 size={20} />
          <span>项目页会根据当前链上状态显示下一项可操作按钮，不需要记住固定步骤。</span>
        </div>
      </div>
    </div>
  )
}
