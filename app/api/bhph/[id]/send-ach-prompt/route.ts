/**
 * POST /api/bhph/[id]/send-ach-prompt
 * Dealer admin/manager: SMS customer a signed link to set up ACH.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canRecordBhphPayment } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { generateAchSetupToken } from '@/lib/bhph/achSetupToken'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

function smsFailureResponse(sent: { ok: boolean; error?: string }): NextResponse {
  const code = sent.error ?? 'unknown'
  if (code === 'twilio_unconfigured') {
    return NextResponse.json(
      {
        error:
          'Text messaging is not configured on this server. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER, or record the payment manually.',
      },
      { status: 503 },
    )
  }
  if (code === 'twilio_network_error') {
    return NextResponse.json(
      { error: 'Could not reach the text provider. Try again in a moment.' },
      { status: 502 },
    )
  }
  return NextResponse.json(
    {
      error:
        typeof sent.error === 'string' && sent.error.length > 0
          ? `Could not send text: ${sent.error}`
          : 'Could not send text message. Check the customer phone number and Twilio settings.',
    },
    { status: 502 },
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  if (!canRecordBhphPayment(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: contractId } = await params
  const supabase = await createClient()

  const { data: row, error } = await supabase
    .from('bhph_payments')
    .select(`
      id, user_id, customer_id, status, ach_setup_sent_at, sms_consent,
      customer:customers(id, name, primary_phone, sms_opt_out),
      vehicle:vehicles(year, make, model)
    `)
    .eq('id', contractId)
    .maybeSingle()

  if (error || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (row.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (row.status !== 'active') {
    return NextResponse.json({ error: 'Contract is not active' }, { status: 409 })
  }

  const sentAt = row.ach_setup_sent_at as string | null
  if (sentAt) {
    const elapsed = Date.now() - new Date(sentAt).getTime()
    if (elapsed < 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: 'An ACH setup link was sent in the last 24 hours.' },
        { status: 429 },
      )
    }
  }

  const cust = row.customer as { name?: string; primary_phone?: string; sms_opt_out?: boolean } | null
  if (!row.sms_consent || !cust?.primary_phone || cust.sms_opt_out) {
    return NextResponse.json(
      { error: 'Customer must have SMS consent and a mobile number on file.' },
      { status: 422 },
    )
  }

  const vehicle = row.vehicle as unknown as { year: number; make: string; model: string } | null
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'vehicle'
  const firstName = (cust.name ?? 'there').split(/\s+/)[0]

  let setupToken: string
  try {
    setupToken = generateAchSetupToken(contractId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ACH setup unavailable'
    console.error('[send-ach-prompt] token', msg)
    return NextResponse.json(
      {
        error:
          msg.includes('BHPH_ACH_SECRET')
            ? 'ACH setup links are not configured (BHPH_ACH_SECRET missing). Record the payment manually instead.'
            : 'Could not create ACH setup link.',
      },
      { status: 503 },
    )
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
  const link = `${base}/pay/ach/${encodeURIComponent(setupToken)}`

  const msg =
    `Hi ${firstName}, set up automatic bank payments for your ${vehicleLabel} — ` +
    `no fees, pulls automatically each month. Tap here: ${link}`

  const to = toE164Us(cust.primary_phone)
  if (!to) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 422 })
  }

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('twilio_phone_number')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const sent = await sendTwilioSms(to, msg, {
    from: orgSettings?.twilio_phone_number ?? null,
  })
  if (!sent.ok) {
    console.error('[send-ach-prompt] twilio', { error: sent.error, to: to.slice(0, 5) + '…' })
    return smsFailureResponse(sent)
  }

  const now = new Date().toISOString()
  await supabase
    .from('bhph_payments')
    .update({ ach_setup_sent_at: now })
    .eq('id', contractId)
    .eq('user_id', profile.org_id)

  return NextResponse.json({ ok: true })
}
