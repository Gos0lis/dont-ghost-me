import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export function ToastViewport() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)
  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? CircleAlert : Info
        return (
          <div className={`toast toast-${toast.kind}`} key={toast.id}>
            <Icon size={20} />
            <div>
              <strong>{toast.title}</strong>
              {toast.description && <p>{toast.description}</p>}
            </div>
            <button onClick={() => dismiss(toast.id)} aria-label="关闭提示"><X size={16} /></button>
          </div>
        )
      })}
    </div>
  )
}
