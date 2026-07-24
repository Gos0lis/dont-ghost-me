import { Check } from 'lucide-react'

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper">
      {steps.map((step, index) => (
        <li key={step} className={index <= current ? 'step-active' : ''}>
          <span>{index < current ? <Check size={15} /> : index + 1}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  )
}
