import { Check, ChevronDown, Copy, LogOut, UserRoundCog, WalletCards, X } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { shortenAddress } from '../utils/format'
import { roleLabel } from '../utils/format'
import { PrimaryButton } from './ui/Buttons'

const connectors = ['MetaMask', 'OKX Wallet', 'Phantom'] as const

export function WalletButton() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const wallet = useAppStore((state) => state.wallet)
  const connect = useAppStore((state) => state.connectWallet)
  const disconnect = useAppStore((state) => state.disconnectWallet)
  const accounts = useAppStore((state) => state.accounts)
  const switchAccount = useAppStore((state) => state.switchAccount)
  const pending = useAppStore((state) => state.pendingMethod === 'connectWallet')

  if (!wallet.isConnected || !wallet.account) {
    return (
      <>
        <PrimaryButton icon={<WalletCards size={17} />} onClick={() => setOpen(true)}>连接钱包</PrimaryButton>
        {open && (
          <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
            <section className="wallet-modal" onMouseDown={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="关闭"><X size={18} /></button>
              <div className="wallet-orb"><WalletCards size={26} /></div>
              <span className="eyebrow">Monad 演示网络</span>
              <h2>连接你的钱包</h2>
              <p>本 Demo 使用模拟钱包，不会发起真实链上交易。</p>
              <div className="connector-list">
                {connectors.map((connector) => (
                  <button
                    key={connector}
                    disabled={pending}
                    onClick={() => void connect(connector).then(() => setOpen(false))}
                  >
                    <span className={`connector-icon connector-${connector.slice(0, 2).toLowerCase()}`}>{connector.slice(0, 1)}</span>
                    <strong>{connector}</strong>
                    <span>模拟连接</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="wallet-control">
      <button className="wallet-connected" onClick={() => setOpen((value) => !value)}>
        <span className="wallet-avatar">{wallet.account.avatar}</span>
        <span><strong>{shortenAddress(wallet.account.address)}</strong><small>{wallet.account.balance} MON</small></span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="wallet-menu">
          <div><span>已连接账户</span><strong>{wallet.account.name}</strong></div>
          <section className="wallet-account-switcher">
            <span><UserRoundCog size={14} />切换演示身份</span>
            {accounts.map((account) => (
              <button
                className={account.id === wallet.account?.id ? 'active' : ''}
                key={account.id}
                onClick={() => void switchAccount(account.id).then(() => setOpen(false))}
              >
                <span className="wallet-avatar">{account.avatar}</span>
                <span><strong>{account.name}</strong><small>{roleLabel[account.role]}</small></span>
                {account.id === wallet.account?.id && <Check size={15} />}
              </button>
            ))}
          </section>
          <button onClick={() => {
            void navigator.clipboard.writeText(wallet.account!.address)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制' : '复制地址'}
          </button>
          <button onClick={() => void disconnect().then(() => setOpen(false))}><LogOut size={16} />断开连接</button>
        </div>
      )}
    </div>
  )
}
