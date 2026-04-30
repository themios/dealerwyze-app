export const dynamic = 'force-dynamic'

import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import BackButton from '@/components/layout/BackButton'
import ReviewForm from '@/components/receipts/ReviewForm'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const service = createServiceClient()

  const { data: receipt } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!receipt) redirect('/receipts')

  // Generate signed URL for the image
  let signedUrl: string | null = null
  if (receipt.storage_path) {
    const { data } = await service.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 3600)
    signedUrl = data?.signedUrl ?? null
  }

  const renderNow = new Date()
  const ninetyDaysAgo = new Date(renderNow.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: categories }, { data: lotVehicles }, { data: soldVehicles }] = await Promise.all([
    supabase
      .from('receipt_categories')
      .select('id, name, requires_vehicle, sort_order')
      .eq('user_id', profile.org_id)
      .order('sort_order'),
    supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, status')
      .eq('user_id', profile.org_id)
      .in('status', ['staging', 'available', 'pending'])
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, status, sold_at')
      .eq('user_id', profile.org_id)
      .eq('status', 'sold')
      .gte('sold_at', ninetyDaysAgo)
      .order('sold_at', { ascending: false })
      .limit(40),
  ])

  return (
    <div className="pb-4">
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <BackButton href="/receipts" />
            <h1 className="text-lg font-semibold">
              {receipt.status === 'posted' ? 'Posted Receipt' : 'Review Receipt'}
            </h1>
          </div>
        }
      />
      <ReviewForm
        receipt={{ ...receipt, signed_url: signedUrl }}
        categories={categories ?? []}
        lotVehicles={lotVehicles ?? []}
        soldVehicles={soldVehicles ?? []}
      />
    </div>
  )
}
