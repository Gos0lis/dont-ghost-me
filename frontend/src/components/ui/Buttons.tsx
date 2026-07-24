import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  loading?: boolean
  icon?: ReactNode
}

export function PrimaryButton({ children, loading, icon, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx('btn btn-primary', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : icon}
      {loading ? '交易处理中…' : children}
    </button>
  )
}

export function SecondaryButton({ children, loading, icon, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={clsx('btn btn-secondary', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : icon}
      {loading ? '处理中…' : children}
    </button>
  )
}
