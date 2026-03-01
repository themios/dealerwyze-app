import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, status, vendor_norm, vendor_raw, total, currency, receipt_date, created_at')
    .eq('user_id', profile.org_id)
    .in('status', ['draft_ready', 'posted', 'failed'])
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ receipts: receipts ?? [] })
}
