import { ChevronDown, UserRoundCog } from 'lucide-react'
import { roleLabel } from '../utils/format'
import { useAppStore } from '../store/useAppStore'

export function RoleSwitcher({ compact = false }: { compact?: boolean }) {
  const wallet = useAppStore((state) => state.wallet)
  const accounts = useAppStore((state) => state.accounts)
  const switchAccount = useAppStore((state) => state.switchAccount)
  if (!wallet.isConnected || !wallet.account) return null
  return (
    <label className={`role-switcher ${compact ? 'role-compact' : ''}`}>
      <UserRoundCog size={16} />
      <span>{compact ? wallet.account.name : roleLabel[wallet.account.role]}</span>
      <select value={wallet.account.id} onChange={(event) => void switchAccount(event.target.value)} aria-label="切换演示账户">
        {accounts.map((account) => (
          <option value={account.id} key={account.id}>{account.name} · {roleLabel[account.role]}</option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  )
}
