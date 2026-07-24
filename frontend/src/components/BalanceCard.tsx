import type { ReactNode } from 'react'

export function BalanceCard({
  label,
  value,
  unit,
  accent,
  icon,
}: {
  label: string
  value: string | number
  unit?: string
  accent?: 'purple' | 'green' | 'orange' | 'red'
  icon?: ReactNode
}) {
  return (
    <div className={`balance-card balance-${accent ?? 'purple'}`}>
      <div className="balance-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}{unit && <small> {unit}</small>}</strong>
      </div>
    </div>
  )
}
