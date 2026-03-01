export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import CaptureClient from '@/components/receipts/CaptureClient'
import Link from 'next/link'
import { Receipt, ChevronRight, Clock, CheckCircle, AlertCircle, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

function statusIcon(status: string) {
  if (status === 'posted') return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (status === 'failed') return <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  return <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
}

function statusLabel(status: string) {
  if (status === 'posted') return 'Posted'
  if (status === 'failed') return 'Classification failed — tap to retry'
  return 'Needs review'
}

export default async function ReceiptsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, status, vendor_norm, vendor_raw, total, receipt_date, created_at')
    .eq('user_id', profile.org_id)
    .in('status', ['draft_ready', 'posted', 'failed'])
    .order('created_at', { ascending: false })
    .limit(30)

  const drafts = (receipts ?? []).filter(r => r.status === 'draft_ready' || r.status === 'failed')
  const recent = (receipts ?? []).filter(r => r.status === 'posted').slice(0, 5)

  return (
    <div className="pb-4">
      <TopBar
        title="Receipts"
        right={
          <Link href="/receipts/ledger">
            <Button size="sm" variant="ghost" className="text-xs gap-1">
              <BookOpen className="h-4 w-4" />
              Ledger
            </Button>
          </Link>
        }
      />

      <CaptureClient />

      {/* Drafts needing review */}
      {drafts.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Needs Review ({drafts.length})
          </p>
          <div className="divide-y rounded-xl border bg-card overflow-hidden">
            {drafts.map(r => (
              <Link
                key={r.id}
                href={`/receipts/${r.id}/review`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                {statusIcon(r.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {r.vendor_norm ?? r.vendor_raw ?? 'Unknown vendor'}
                  </p>
                  <p className="text-xs text-muted-foreground">{statusLabel(r.status)}</p>
                </div>
                <div className="text-right flex-shrink-0 mr-1">
                  {r.total != null && (
                    <p className="text-sm font-semibold">${Number(r.total).toFixed(2)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {r.receipt_date
                      ? new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recently posted */}
      {recent.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recently Posted
          </p>
          <div className="divide-y rounded-xl border bg-card overflow-hidden">
            {recent.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{r.vendor_norm ?? r.vendor_raw ?? 'Unknown vendor'}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.receipt_date
                      ? new Date(r.receipt_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {r.total != null && (
                  <p className="text-sm font-semibold flex-shrink-0">${Number(r.total).toFixed(2)}</p>
                )}
              </div>
            ))}
          </div>
          <Link href="/receipts/ledger">
            <p className="text-xs text-primary text-center mt-2 py-1">View full ledger →</p>
          </Link>
        </div>
      )}

      {/* Empty state */}
      {drafts.length === 0 && recent.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No receipts yet</p>
          <p className="text-xs mt-1">Snap or upload your first receipt above</p>
        </div>
      )}
    </div>
  )
}
