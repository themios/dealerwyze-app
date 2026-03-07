/**
 * GET /api/admin/orgs/[id]/shadow-billing
 *
 * Returns what the org's usage this billing cycle would cost at list overage rates,
 * as if no hard caps existed. Useful for pricing validation and identifying
 * heavy-use orgs before they hit abuse thresholds.
 *
 * Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

const SMS_RATE   = 0.08   // $ per message above quota
const MMS_RATE   = 0.15   // $ per MMS above cap
const VOICE_RATE = 0.12   // $ per overage minute
const FAX_RATE   = 0.10   // $ per fax page above cap
const MMS_CAP    = 200    // included MMS/mo

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id: orgId } = await params

  const supabase = createServiceClient()
  const { data: org, error } = await supabase
    .from('organizations')
    .select(`
      monthly_message_count, monthly_mms_count, sms_quota,
      voice_overage_minutes, monthly_fax_pages, fax_page_cap
    `)
    .eq('id', orgId)
    .maybeSingle()

  if (error || !org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  const smsUsed   = (org.monthly_message_count as number) ?? 0
  const mmsUsed   = (org.monthly_mms_count as number) ?? 0
  const smsQuota  = (org.sms_quota as number) ?? 0
  const voiceOvMin= (org.voice_overage_minutes as number) ?? 0
  const faxUsed   = (org.monthly_fax_pages as number) ?? 0
  const faxCap    = (org.fax_page_cap as number) ?? 50

  const shadowSms   = Math.max(0, smsUsed - smsQuota)  * SMS_RATE
  const shadowMms   = Math.max(0, mmsUsed - MMS_CAP)   * MMS_RATE
  const shadowVoice = voiceOvMin                        * VOICE_RATE
  const shadowFax   = Math.max(0, faxUsed - faxCap)    * FAX_RATE
  const total       = shadowSms + shadowMms + shadowVoice + shadowFax

  return NextResponse.json({
    org_id: orgId,
    line_items: [
      { label: 'SMS overage',   units: Math.max(0, smsUsed - smsQuota), rate: SMS_RATE,   amount: shadowSms },
      { label: 'MMS overage',   units: Math.max(0, mmsUsed - MMS_CAP),  rate: MMS_RATE,   amount: shadowMms },
      { label: 'Voice overage', units: voiceOvMin,                       rate: VOICE_RATE, amount: shadowVoice },
      { label: 'Fax overage',   units: Math.max(0, faxUsed - faxCap),   rate: FAX_RATE,   amount: shadowFax },
    ],
    total,
    usage_snapshot: { smsUsed, smsQuota, mmsUsed, voiceOvMin, faxUsed, faxCap },
  })
}
