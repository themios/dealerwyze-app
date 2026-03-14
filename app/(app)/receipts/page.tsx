export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import CaptureClient from '@/components/receipts/CaptureClient'
import PostedReceiptRow from '@/components/receipts/PostedReceiptRow'
import DraftReceiptRow from '@/components/receipts/DraftReceiptRow'
import Link from 'next/link'
import { Receipt, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default async function ReceiptsPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

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
              <DraftReceiptRow key={r.id} r={r} />
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
              <PostedReceiptRow key={r.id} r={r} />
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
