import type { ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { PrimaryButton, SecondaryButton } from './Buttons'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认交易',
  danger,
  loading,
  details,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  details?: ReactNode
  onConfirm: () => void
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="关闭确认窗口">
          <X size={19} />
        </button>
        <div className={`modal-icon ${danger ? 'modal-icon-danger' : ''}`}>
          <AlertTriangle size={23} />
        </div>
        <span className="eyebrow">模拟链上交易</span>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        {details && <div className="tx-details">{details}</div>}
        <div className="modal-actions">
          <SecondaryButton onClick={onClose} disabled={loading}>取消</SecondaryButton>
          <PrimaryButton loading={loading} onClick={onConfirm}>{confirmLabel}</PrimaryButton>
        </div>
      </section>
    </div>
  )
}
