import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { renderVehicleVideo } from '@/lib/remotion/renderVehicleVideo'
import { getAgentContact } from '@/lib/showings/getAgentContact'
import { getRemotionAppBaseUrl } from '@/lib/remotion/lambdaConfig'

interface ShowingRow {
  id: string
  org_id: string
  listing_id: string
  agent_id: string
  buyer_name: string
  buyer_email: string | null
  confirmed_time: string | null
}

export async function getLatestCompleteListingVideo(
  supabase: SupabaseClient,
  orgId: string,
  listingId: string,
): Promise<{ id: string; output_url: string } | null> {
  const { data } = await supabase
    .from('video_renders')
    .select('id, output_url')
    .eq('org_id', orgId)
    .eq('vehicle_id', listingId)
    .eq('status', 'complete')
    .not('output_url', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data?.output_url) return null
  return { id: data.id, output_url: data.output_url }
}

export interface ShowingVideoResult {
  renderId?: string
  videoUrl?: string
  pending: boolean
}

/**
 * Returns an existing tour video or queues a new Lambda render linked to the showing.
 */
export async function resolveShowingConfirmationVideo(
  supabase: SupabaseClient,
  params: {
    orgId: string
    listingId: string
    showingRequestId: string
    triggeredByUser: string
    templateId?: string
  },
): Promise<ShowingVideoResult> {
  const existing = await getLatestCompleteListingVideo(supabase, params.orgId, params.listingId)
  if (existing) {
    return { videoUrl: existing.output_url, pending: false }
  }

  const result = await renderVehicleVideo(supabase, {
    orgId: params.orgId,
    vehicleId: params.listingId,
    triggeredByUser: params.triggeredByUser,
    templateId: params.templateId,
    showingRequestId: params.showingRequestId,
  })

  return { renderId: result.renderId, pending: true }
}

export function buildShowingConfirmationHtml(params: {
  buyerName: string
  address: string
  confirmedTime: string
  orgName: string
  videoUrl?: string
  videoPending?: boolean
}): string {
  const when = new Date(params.confirmedTime).toLocaleString()
  const videoBlock = params.videoUrl
    ? `<p style="margin:24px 0 0"><a href="${params.videoUrl}" style="color:#F07018;font-weight:700">Watch your property tour video</a></p>`
    : params.videoPending
      ? `<p style="margin:24px 0 0;color:#64748B">Your property tour video is generating — we will email you the link shortly.</p>`
      : ''

  return `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#374151;line-height:1.7">
<p>Hi ${params.buyerName},</p>
<p>Your showing is confirmed for <strong>${when}</strong>.</p>
<p>Property: ${params.address}</p>
${videoBlock}
<p style="margin-top:24px">If you need to reschedule, reply to this email and your agent will help.</p>
<p>Best regards,<br/>${params.orgName}</p>
</body></html>`
}

export async function sendShowingConfirmationEmail(params: {
  showing: ShowingRow
  address: string
  confirmedTime: string
  orgName: string
  videoUrl?: string
  videoPending?: boolean
}): Promise<void> {
  if (!params.showing.buyer_email) return

  const supabase = createServiceClient()
  const agentContact = await getAgentContact(supabase, params.showing.agent_id)
  const subject = `Your showing is confirmed for ${params.address}`
  const html = buildShowingConfirmationHtml({
    buyerName: params.showing.buyer_name,
    address: params.address,
    confirmedTime: params.confirmedTime,
    orgName: params.orgName,
    videoUrl: params.videoUrl,
    videoPending: params.videoPending,
  })

  await sendNotificationEmail({
    to: params.showing.buyer_email,
    subject,
    html,
    org_id: params.showing.org_id,
    email_type: params.videoUrl
      ? 'showing_confirmed_buyer_video'
      : params.videoPending
        ? 'showing_confirmed_buyer_video_pending'
        : 'showing_confirmed_buyer',
    vertical: 'real_estate',
    reply_to: agentContact?.email,
  })
}

/** Called from Remotion webhook when a showing-linked render completes. */
export async function deliverShowingTourVideoEmail(
  showingRequestId: string,
  videoUrl: string,
): Promise<void> {
  const supabase = createServiceClient()

  const { data: showing } = await supabase
    .from('showing_requests')
    .select(
      'id, org_id, listing_id, agent_id, buyer_name, buyer_email, confirmed_time, status',
    )
    .eq('id', showingRequestId)
    .maybeSingle()

  if (!showing?.buyer_email || showing.status !== 'confirmed') return

  const { data: listing } = await supabase
    .from('vehicles')
    .select('address_line1, city, state, zip')
    .eq('id', showing.listing_id)
    .maybeSingle()

  const address = [
    listing?.address_line1,
    listing?.city,
    listing?.state,
    listing?.zip,
  ]
    .filter(Boolean)
    .join(', ')

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', showing.org_id)
    .maybeSingle()

  const agentContact = await getAgentContact(supabase, showing.agent_id)
  const when = showing.confirmed_time
    ? new Date(showing.confirmed_time).toLocaleString()
    : 'your scheduled time'
  const appUrl = getRemotionAppBaseUrl() || 'https://realtywyze.us'

  await sendNotificationEmail({
    to: showing.buyer_email,
    subject: `Your property tour video for ${address || 'your showing'}`,
    html: `<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#374151;line-height:1.7">
<p>Hi ${showing.buyer_name},</p>
<p>Your property tour video is ready for your showing on <strong>${when}</strong>.</p>
<p style="margin:20px 0"><a href="${videoUrl}" style="display:inline-block;background:#F07018;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Watch property tour</a></p>
<p>Property: ${address || 'See link above'}</p>
<p><a href="${appUrl}/app/showings">View your showings</a></p>
</body></html>`,
    org_id: showing.org_id,
    email_type: 'showing_tour_video_ready',
    vertical: 'real_estate',
    reply_to: agentContact?.email,
  })
}
