/**
 * Persist a public showing request as a web lead + high-priority Today activity.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { applyLeadLocationDetection } from '@/lib/leads/detectLeadLocation'
import { applyAutoLeadAssignment } from '@/lib/leads/assignLead'
import { notifyDealerNewLead } from '@/lib/vdp/notifyDealer'

export interface RecordShowingWebLeadParams {
  supabase: SupabaseClient
  orgId: string
  listingId: string
  showingRequestId: string
  buyerName: string
  buyerEmail: string
  buyerPhone: string | null
  address: string
  requestedTimes: string[]
  message: string | null
  sourceUrl?: string | null
}

function formatTimes(times: string[]): string {
  if (!times.length) return 'Flexible'
  return times.map((t) => new Date(t).toLocaleString('en-US')).join('; ')
}

export async function recordShowingWebLead(params: RecordShowingWebLeadParams): Promise<void> {
  const {
    supabase,
    orgId,
    listingId,
    showingRequestId,
    buyerName,
    buyerEmail,
    buyerPhone,
    address,
    requestedTimes,
    message,
    sourceUrl,
  } = params

  const inquiryMessage = [
    `Showing request — preferred times: ${formatTimes(requestedTimes)}`,
    message ? `Buyer note: ${message}` : null,
    `Manage: /showings/${showingRequestId}`,
  ]
    .filter(Boolean)
    .join('\n')

  await supabase.from('inventory_inquiries').insert({
    org_id: orgId,
    vehicle_id: listingId,
    name: buyerName,
    email: buyerEmail,
    phone: buyerPhone,
    message: inquiryMessage,
    source_url: sourceUrl ?? null,
    status: 'new',
  })

  const activityBody = [
    `Showing request from ${buyerName}`,
    `Email: ${buyerEmail}`,
    buyerPhone ? `Phone: ${buyerPhone}` : null,
    `Property: ${address}`,
    `Preferred times: ${formatTimes(requestedTimes)}`,
    message ? `Message: ${message}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  await supabase.from('activities').insert({
    user_id: orgId,
    vehicle_id: listingId,
    type: 'appointment',
    direction: 'inbound',
    outcome: 'pending',
    body: activityBody,
    priority: 'high',
  })

  let customerId: string | null = null
  if (buyerPhone || buyerEmail) {
    const { data: allCustomers } = await supabase
      .from('customers')
      .select('id, primary_phone, email')
      .eq('user_id', orgId)
      .is('merged_at', null)

    const normalPhone = buyerPhone?.replace(/\D/g, '') ?? ''
    const existing = allCustomers?.find((c) => {
      if (normalPhone && c.primary_phone?.replace(/\D/g, '') === normalPhone) return true
      if (buyerEmail && c.email?.toLowerCase() === buyerEmail.toLowerCase()) return true
      return false
    })

    if (existing) {
      customerId = existing.id
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({
          user_id: orgId,
          name: buyerName,
          email: buyerEmail,
          primary_phone: buyerPhone,
          lead_source: 'web',
        })
        .select('id')
        .single()
      if (created) customerId = created.id
    }
  }

  if (customerId) {
    void applyLeadLocationDetection({ customerId, orgId, supabase })
      .then(() => applyAutoLeadAssignment({ customerId, orgId, supabase }))
      .catch(() => {})
  }

  await notifyDealerNewLead(
    orgId,
    buyerName,
    buyerPhone ?? undefined,
    inquiryMessage,
    `Showing: ${address}`,
  )
}
