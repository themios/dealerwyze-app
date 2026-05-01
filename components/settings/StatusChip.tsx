import { cn } from '@/lib/utils'

export type StatusChipTone = 'connected' | 'healthy' | 'optional' | 'pending' | 'error'

const STATUS_STYLES: Record<StatusChipTone, string> = {
  connected: 'bg-green-100 text-green-700',
  healthy: 'bg-emerald-100 text-emerald-700',
  optional: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
}

interface StatusChipProps {
  tone: StatusChipTone
  label?: string
  className?: string
}

export default function StatusChip({ tone, label, className }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        STATUS_STYLES[tone],
        className,
      )}
    >
      {label ?? tone}
    </span>
  )
}
