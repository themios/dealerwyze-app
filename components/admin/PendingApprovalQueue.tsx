'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PendingOrg {
  id: string
  name: string
  created_at: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function PendingApprovalQueue({ orgs }: { orgs: PendingOrg[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [localOrgs, setLocalOrgs] = useState(orgs)

  async function approve(id: string) {
    setBusy(id)
    await fetch(`/api/admin/orgs/${id}/approve`, { method: 'POST' })
    setLocalOrgs(prev => prev.filter(o => o.id !== id))
    setBusy(null)
    router.refresh()
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return
    setBusy(id)
    await fetch(`/api/admin/orgs/${id}/approve`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    })
    setLocalOrgs(prev => prev.filter(o => o.id !== id))
    setRejectTarget(null)
    setRejectReason('')
    setBusy(null)
    router.refresh()
  }

  if (localOrgs.length === 0) return null

  return (
    <section>
      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-3">
        Awaiting Approval ({localOrgs.length})
      </p>
      <div className="space-y-3">
        {localOrgs.map(org => (
          <div key={org.id} className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{org.name || 'Unnamed'}</p>
                <p className="text-xs text-muted-foreground">Signed up {formatDate(org.created_at)}</p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                Pending
              </span>
            </div>

            {rejectTarget === org.id ? (
              <div className="space-y-2">
                <textarea
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
                  rows={2}
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => reject(org.id)}
                    disabled={!rejectReason.trim() || busy === org.id}
                    className="flex-1 rounded-lg bg-red-600 text-white text-sm font-medium py-1.5 disabled:opacity-50"
                  >
                    {busy === org.id ? 'Rejecting…' : 'Confirm Reject'}
                  </button>
                  <button
                    onClick={() => { setRejectTarget(null); setRejectReason('') }}
                    className="flex-1 rounded-lg border bg-card text-sm font-medium py-1.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => approve(org.id)}
                  disabled={busy === org.id}
                  className="flex-1 rounded-lg bg-green-600 text-white text-sm font-medium py-1.5 disabled:opacity-50"
                >
                  {busy === org.id ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => setRejectTarget(org.id)}
                  className="flex-1 rounded-lg border border-red-200 text-red-600 text-sm font-medium py-1.5"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
