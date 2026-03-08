import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { searchAvailableNumbers, buyNumber, releaseNumber, lookupOwnedNumber, updateNumberWebhooks } from '@/lib/twilio/provision'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

/**
 * POST /api/admin/provision-phone
 *
 * type='toll_free' | 'local'  → buy a new number from Twilio
 * type='existing'              → register a number the org already owns
 *
 * Body:
 *   { org_id?, type, area_code?, dealership_name? }          ← new number
 *   { org_id?, type:'existing', phone_number }               ← existing number
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const supabase = createServiceClient()
  const body = await req.json() as {
    org_id?: string
    type: 'toll_free' | 'local' | 'existing'
    area_code?: string
    dealership_name?: string
    phone_number?: string   // only for type='existing'
  }

  const targetOrgIdCheck = body.org_id ?? profile.org_id
  const { data: targetOrg } = await supabase
    .from('organizations')
    .select('subscription_status')
    .eq('id', targetOrgIdCheck)
    .single()

  // Block DealerWyze-provisioned numbers on free trial (dealers use their own number during trial)
  if (targetOrg?.subscription_status === 'trialing' && body.type !== 'existing') {
    return NextResponse.json(
      { error: 'To get a new number through DealerWyze you need an active plan. During trial, add a number you already have — choose "I have a number".' },
      { status: 403 }
    )
  }

  const targetOrgId    = body.org_id ?? profile.org_id
  const dealershipName = body.dealership_name ?? 'Dealer'

  // Block if org already has a number registered
  const { data: existing } = await supabase
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', targetOrgId)
    .maybeSingle()

  if (existing?.twilio_phone_number) {
    return NextResponse.json(
      { error: 'This dealership already has a phone number. Release it first in Settings if you want to change it.' },
      { status: 400 }
    )
  }

  // ── Bring-Your-Own-Number path ──────────────────────────────────────────────
  if (body.type === 'existing') {
    const raw = (body.phone_number ?? '').replace(/\D/g, '')
    const e164 = raw.length === 10 ? `+1${raw}` : raw.length === 11 ? `+${raw}` : null
    if (!e164) {
      return NextResponse.json({ error: 'Please enter a valid US phone number (10 digits).' }, { status: 400 })
    }

    // Look up on master Twilio account — get SID + update webhooks if found
    let sid: string | null = null
    try {
      sid = await lookupOwnedNumber(e164)
      if (sid) await updateNumberWebhooks(sid)
    } catch {
      // Non-fatal: store number even if Twilio lookup fails
    }

    const { error: upsertErr } = await supabase
      .from('org_settings')
      .upsert(
        {
          org_id: targetOrgId,
          twilio_phone_number: e164,
          twilio_phone_sid:    sid,          // null if not on master account
          updated_at:          new Date().toISOString(),
        },
        { onConflict: 'org_id' }
      )

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

    return NextResponse.json({
      phoneNumber: e164,
      sid,
      type: 'existing',
      webhooksUpdated: !!sid,
    })
  }

  // ── Buy-New-Number path ─────────────────────────────────────────────────────
  let available
  try {
    available = await searchAvailableNumbers(body.type ?? 'toll_free', body.area_code)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }

  if (available.length === 0) {
    const hint = body.type === 'local' && body.area_code
      ? `No local numbers for area code ${body.area_code}. Try a nearby code or use toll-free.`
      : 'No numbers available. Try a different area code or type.'
    return NextResponse.json({ error: hint }, { status: 404 })
  }

  let sid: string, phoneNumber: string
  try {
    ;({ sid, phoneNumber } = await buyNumber(available[0].phoneNumber, `DealerWyze - ${dealershipName}`))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 })
  }

  const { error: upsertErr } = await supabase
    .from('org_settings')
    .upsert(
      { org_id: targetOrgId, twilio_phone_number: phoneNumber, twilio_phone_sid: sid, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' }
    )

  if (upsertErr) {
    await releaseNumber(sid).catch(() => {})
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({ phoneNumber, sid, type: body.type })
}

/**
 * DELETE /api/admin/provision-phone
 * Body: { org_id?: string }
 *
 * If the number has a SID (owned on master account) → release it in Twilio.
 * If no SID (external/BYON) → just clear from org_settings.
 */
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const supabase = createServiceClient()
  const body = await req.json() as { org_id?: string }
  const targetOrgId = body.org_id ?? profile.org_id

  const { data: settings } = await supabase
    .from('org_settings')
    .select('twilio_phone_sid, twilio_phone_number')
    .eq('org_id', targetOrgId)
    .maybeSingle()

  if (!settings?.twilio_phone_number) {
    return NextResponse.json({ error: 'No phone number configured for this org' }, { status: 404 })
  }

  // Only release from Twilio if we own the SID (not a BYON number)
  if (settings.twilio_phone_sid) {
    try {
      await releaseNumber(settings.twilio_phone_sid)
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 502 })
    }
  }

  await supabase
    .from('org_settings')
    .update({ twilio_phone_number: null, twilio_phone_sid: null, updated_at: new Date().toISOString() })
    .eq('org_id', targetOrgId)

  return NextResponse.json({ ok: true, released: settings.twilio_phone_number })
}
