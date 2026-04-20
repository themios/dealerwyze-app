'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'

type RenderStatus = 'pending' | 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'

interface RenderStatusBadgeProps {
  vehicleId: string
  initialStatus?: RenderStatus
  onReady?: (outputUrl: string) => void
}

export default function RenderStatusBadge({ vehicleId, initialStatus, onReady }: RenderStatusBadgeProps) {
  const [status, setStatus] = useState<RenderStatus | null>(initialStatus ?? null)

  useEffect(() => {
    if (!vehicleId) return

    let timer: ReturnType<typeof setTimeout>
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/vehicles/${vehicleId}/render`)
        if (!res.ok) return
        const data = await res.json() as { render: { status: RenderStatus; output_url?: string } | null }
        if (!active) return
        if (data.render) {
          setStatus(data.render.status)
          if (data.render.status === 'complete' && data.render.output_url && onReady) {
            onReady(data.render.output_url)
          }
          if (data.render.status === 'rendering' || data.render.status === 'queued') {
            timer = setTimeout(poll, 8000)
          }
        }
      } catch {
        // Silently retry
        if (active) timer = setTimeout(poll, 10000)
      }
    }

    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [vehicleId, onReady])

  if (!status) return null

  const configs: Record<RenderStatus, { icon: React.ReactNode; label: string; className: string }> = {
    pending:   { icon: <Clock className="h-3.5 w-3.5" />,                label: 'Pending',   className: 'bg-muted text-muted-foreground' },
    queued:    { icon: <Clock className="h-3.5 w-3.5" />,                label: 'Queued',    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    rendering: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: 'Rendering', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
    complete:  { icon: <CheckCircle2 className="h-3.5 w-3.5" />,         label: 'Ready',     className: 'bg-green-500/10 text-green-600 dark:text-green-400' },
    failed:    { icon: <XCircle className="h-3.5 w-3.5" />,              label: 'Failed',    className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
    cancelled: { icon: <XCircle className="h-3.5 w-3.5" />,              label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  }

  const cfg = configs[status]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}
