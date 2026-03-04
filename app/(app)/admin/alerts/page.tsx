'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Alert {
  id: string
  org_id: string
  alert_type: string
  severity: string
  created_at: string
  resolved_at: string | null
  organizations: { id: string; name: string } | null
}

const TYPE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  trial_expiring: { label: 'Trial Expiring',  desc: 'Trial ends in ≤3 days with no recent activity', color: 'border-red-200 bg-red-50 dark:bg-red-950/20' },
  no_activity:    { label: 'No Activity',     desc: 'Active org with no login in 21+ days',           color: 'border-orange-200 bg-orange-50 dark:bg-orange-950/20' },
  past_due:       { label: 'Past Due',        desc: 'Subscription payment failed',                    color: 'border-red-200 bg-red-50 dark:bg-red-950/20' },
  no_email:       { label: 'No Email Setup',  desc: 'No active email account connected',              color: 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20' },
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AdminAlertsPage() {
  const router = useRouter()
  const [alerts, setAlerts]   = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/alerts')
      .then(r => r.json())
      .then((d: Alert[]) => { setAlerts(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function resolve(id: string) {
    setResolving(id)
    await fetch(`/api/admin/alerts/${id}/resolve`, { method: 'POST' })
    setAlerts(prev => prev.filter(a => a.id !== id))
    setResolving(null)
  }

  const open = alerts.filter(a => !a.resolved_at)

  return (
    <div>
      <TopBar title={`Alerts (${open.length})`} />
      <div className="px-4 py-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : open.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-sm text-muted-foreground">All clear — no open alerts.</p>
          </div>
        ) : (
          open.map(a => {
            const meta = TYPE_LABELS[a.alert_type] ?? { label: a.alert_type, desc: '', color: 'border-muted bg-card' }
            return (
              <div key={a.id} className={`rounded-xl border p-4 space-y-2 ${meta.color}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(a.created_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => router.push(`/admin/orgs/${a.org_id}`)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {a.organizations?.name ?? 'Unknown org'} →
                  </button>
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs"
                    disabled={resolving === a.id}
                    onClick={() => resolve(a.id)}
                  >
                    {resolving === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Resolve'}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
