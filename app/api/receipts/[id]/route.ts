import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Generate signed URL (1 hour)
  let signed_url: string | null = null
  if (receipt.storage_path) {
    const { data } = await service.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 3600)
    signed_url = data?.signedUrl ?? null
  }

  const { data: categories } = await supabase
    .from('receipt_categories')
    .select('id, name, requires_vehicle, sort_order')
    .eq('user_id', profile.org_id)
    .order('sort_order')

  return NextResponse.json({
    receipt: { ...receipt, signed_url },
    categories: categories ?? [],
  })
}
