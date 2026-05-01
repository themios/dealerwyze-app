import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { orgTodayActionLimiter } from '@/lib/rateLimit/upstash'
import { sendLastDitchMessage } from '@/lib/leads/lastDitch'

const schema = z.object({
  activityId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const rate = await orgTodayActionLimiter(profile.org_id)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many actions. Please try again in a moment.' }, { status: 429 })
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { activityId } = parsed.data
  const supabase = await createClient()

  const { data: activity } = await supabase
    .from('activities')
    .select(`
      id, user_id, customer_id,
      customer:customers(
        id, name, primary_phone, sms_opt_out, sms_consent_status, last_ditch_sent_at
      )
    `)
    .eq('id', activityId)
    .maybeSingle()

  if (!activity) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (activity.user_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const customer = Array.isArray(activity.customer) ? activity.customer[0] : activity.customer
  if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })

  const result = await sendLastDitchMessage(supabase, {
    orgId: profile.org_id,
    customerId: customer.id as string,
    customerName: (customer.name as string) ?? 'there',
    customerPhone: (customer.primary_phone as string | null) ?? null,
    smsConsent: (customer.sms_consent_status as string) === 'granted',
    smsOptOut: Boolean(customer.sms_opt_out),
    lastDitchSentAt: (customer.last_ditch_sent_at as string | null) ?? null,
    activityId,
  })

  const skipped = result.startsWith('skipped_')
  if (result === 'failed') {
    return NextResponse.json({ error: 'Failed to send message.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, result, skipped })
}
