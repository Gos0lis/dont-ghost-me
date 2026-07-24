import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Gamepad2,
  MapPinned,
  Plane,
  Rocket,
  ShieldCheck,
  Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BountyCard } from '../components/BountyCard'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { useAppStore } from '../store/useAppStore'

const mechanisms = [
  { icon: ShieldCheck, number: '01', title: '先承诺', description: '每位成员明确任务，并将保证金锁定到共同承诺中。' },
  { icon: Rocket, number: '02', title: '鸽了就转悬赏', description: '退出成员的保证金自动进入救场池，不再制造内耗。' },
  { icon: CheckCircle2, number: '03', title: '谁救场谁拿钱', description: '完成遗留任务并通过验收，即可获得对应奖励。' },
]

const scenarios = [
  { icon: BriefcaseBusiness, title: '黑客松组队', active: true, to: '/project/monad-hackathon' },
  { icon: Plane, title: '朋友旅行', active: true, to: '/travel' },
  { icon: Trophy, title: '比赛组队', active: false },
  { icon: Gamepad2, title: '游戏开黑', active: false },
  { icon: Rocket, title: '创业协作', active: false },
]

export function HomePage() {
  const bounties = useAppStore((state) => state.bounties)
  const mainBounty = bounties.find((item) => item.id === 'smart-contract-mvp')
  return (
    <>
      <section className="hero section-shell">
        <div className="hero-copy">
          <div className="hero-pill"><span /> 基于 Monad 的承诺与救场协议</div>
          <h1>你可以<span>鸽</span>，<br />但要为<span className="hero-accent">救场</span>买单。</h1>
          <p>团队协作最怕的不是有人退出，而是退出后留下的任务无人处理。把违约保证金转化为救场悬赏，让真正解决问题的人获得奖励。</p>
          <div className="hero-actions">
            <Link to="/create"><PrimaryButton>创建共同承诺 <ArrowRight size={17} /></PrimaryButton></Link>
            <Link to="/bounties"><SecondaryButton>查看救场悬赏</SecondaryButton></Link>
          </div>
          <div className="hero-trust">
            <span><CheckCircle2 size={16} /> 本地模拟链上交易</span>
            <span><CheckCircle2 size={16} /> 可完整演示救场闭环</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-glow" />
          <img src="/assets/pigeons/pigeon-hero-heart-shield.png" alt="抱着破碎承诺与救场盾牌的紫色鸽子" />
          <div className="floating-stat stat-top"><span>救场悬赏池</span><strong>100 MON</strong></div>
          <div className="floating-stat stat-bottom"><CheckCircle2 size={18} /><span>奖励已支付给救场者</span></div>
        </div>
      </section>

      <section className="mechanism-strip section-shell">
        {mechanisms.map(({ icon: Icon, number, title, description }) => (
          <article key={number}>
            <div className="mechanism-icon"><Icon size={22} /></div>
            <span>{number}</span>
            <div><h3>{title}</h3><p>{description}</p></div>
          </article>
        ))}
      </section>

      <section className="section-shell content-section">
        <div className="section-heading">
          <div><span className="eyebrow">🔥 热门救场悬赏</span><h2>缺口正在等人补上</h2></div>
          <Link to="/bounties">查看全部 <ArrowRight size={16} /></Link>
        </div>
        {mainBounty ? (
          <BountyCard bounty={mainBounty} />
        ) : (
          <article className="bounty-teaser">
            <img src="/assets/pigeons/pigeon-builder-laptop.png" alt="" />
            <div><span className="tag">即将发布</span><h3>紧急完成智能合约 MVP</h3><p>Yunn 退出后，100 MON 保证金将用于修复合约开发缺口。</p></div>
            <Link to="/project/monad-hackathon"><PrimaryButton>进入项目触发救场</PrimaryButton></Link>
          </article>
        )}
      </section>

      <section className="section-shell content-section">
        <div className="section-heading">
          <div><span className="eyebrow">更多使用场景</span><h2>不只是黑客松工具</h2><p>适用于任何多人承诺和临时违约的补救协作。</p></div>
        </div>
        <div className="scenario-grid">
          {scenarios.map(({ icon: Icon, title, active, to }) => active && to ? (
            <Link key={title} className="scenario-active" to={to}>
              <span><Icon size={24} /></span><strong>{title}</strong><small>完整 Demo</small>
            </Link>
          ) : (
            <button key={title}>
              <span><Icon size={24} /></span><strong>{title}</strong><small>更多可能</small>
            </button>
          ))}
        </div>
        <article className="travel-card">
          <div className="travel-icon"><MapPinned size={28} /></div>
          <div>
            <span className="eyebrow">朋友旅行 · 补救机制示例</span>
            <h3>五人旅行，有人临时鸽了怎么办？</h3>
            <p>退出者的保证金不直接平分，而是奖励给找到替补、转卖门票、修改酒店和重新协调行程的人。</p>
          </div>
          <Link className="text-link" to="/travel">进入旅行救场 Demo <ArrowRight size={15} /></Link>
        </article>
      </section>
    </>
  )
}
