import { ArrowRight, CheckCircle2, Coins, Copy, ExternalLink, Gift, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../utils/format'

export function SettlementSuccessPage() {
  const bounty = useAppStore((state) => state.bounties.find((item) => item.id === 'smart-contract-mvp'))
  const project = useAppStore((state) => state.projects.find((item) => item.id === 'monad-hackathon'))
  const receipt = useAppStore((state) => state.lastReceipt)
  return (
    <div className="success-page">
      <section className="success-card">
        <div className="confetti confetti-1" /><div className="confetti confetti-2" /><div className="confetti confetti-3" />
        <img src="/assets/pigeons/pigeon-success-coin-shield.png" alt="举着奖励金币和救场盾牌的鸽子" />
        <span className="success-kicker"><CheckCircle2 size={16} />结算交易成功</span>
        <h1>验收成功！</h1>
        <p className="success-lead"><strong>{bounty?.reward ?? 80} MON</strong> 已支付给救场者</p>
        <div className="settlement-stats">
          <div><Coins size={20} /><span>原悬赏池</span><strong>100 MON</strong></div>
          <div><Gift size={20} /><span>已支付</span><strong>80 MON</strong></div>
          <div><ShieldCheck size={20} /><span>剩余余额</span><strong>{project?.rescuePool ?? 20} MON</strong></div>
        </div>
        <div className="settlement-receipt">
          <div><span>救场者钱包</span><strong>{shortenAddress(bounty?.rescuerAddress)}</strong></div>
          <div><span>交易哈希</span><code>{shortenAddress(receipt?.hash ?? bounty?.paidTxHash)}</code><Copy size={14} /></div>
          <div><span>区块高度</span><strong>{receipt?.blockNumber ?? 12_345_678}</strong></div>
          <div><span>项目状态</span><strong className="green-text">已恢复进行</strong></div>
        </div>
        <blockquote>“违约没有变成内耗，而是变成了解决问题的奖励。”</blockquote>
        <div className="success-actions">
          <Link to="/project/monad-hackathon"><PrimaryButton>返回项目详情 <ArrowRight size={16} /></PrimaryButton></Link>
          <Link to="/bounties"><SecondaryButton>查看全部悬赏 <ExternalLink size={15} /></SecondaryButton></Link>
        </div>
      </section>
    </div>
  )
}
