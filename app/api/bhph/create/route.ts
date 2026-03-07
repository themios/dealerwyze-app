/**
 * POST /api/bhph/create
 * Creates a BHPH contract when a vehicle is marked as sold.
 * Runs server-side to correctly set user_id = org_id and capture consent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireProfile } from '@/lib/auth/profile'
import { CONSENT_DISCLOSURE } from '@/lib/bhph/schedule'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const service = createServiceClient()

  const body = await req.json()
  const {
    vehicle_id,
    sold_price,
    finance_type,
    finance_company,
    customer_id,
    // BHPH specific
    down_payment,
    loan_amount,
    monthly_payment,
    payment_frequency,
    payment_day,
    first_due_date,
    customer_email,
    sms_consent,
    email_consent,
    notes,
  } = body

  if (!vehicle_id || !sold_price) {
    return NextResponse.json({ error: 'vehicle_id and sold_price are required' }, { status: 400 })
  }

  const orgId = profile.org_id
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'

  // 1. Update vehicle to sold
  const { error: vErr } = await supabase
    .from('vehicles')
    .update({
      status: 'sold',
      sold_price: parseFloat(sold_price),
      sold_at: new Date().toISOString(),
      sold_to_customer_id: customer_id || null,
      finance_type,
      finance_company: finance_company || null,
    })
    .eq('id', vehicle_id)

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // 2. Create BHPH contract if applicable
  if (finance_type === 'bhph' && monthly_payment && first_due_date) {
    if (!customer_id) {
      return NextResponse.json({ error: 'Customer required for BHPH contracts' }, { status: 400 })
    }

    const { error: bhphErr } = await service.from('bhph_payments').insert({
      user_id: orgId,
      vehicle_id,
      customer_id,
      down_payment: parseFloat(down_payment) || 0,
      loan_amount: loan_amount ? parseFloat(loan_amount) : null,
      monthly_payment: parseFloat(monthly_payment),
      payment_frequency: payment_frequency ?? 'monthly',
      payment_day_of_month: parseInt(payment_day) || 1,
      frequency_anchor_date: first_due_date,
      payment_day_anchor: parseInt(payment_day) || 1,
      next_due_date: first_due_date,
      customer_email: customer_email || null,
      sms_consent: sms_consent ?? false,
      sms_consent_at: sms_consent ? new Date().toISOString() : null,
      sms_consent_ip: sms_consent ? clientIp : null,
      sms_consent_disclosure: sms_consent ? CONSENT_DISCLOSURE : null,
      email_consent: email_consent ?? false,
      email_consent_at: email_consent ? new Date().toISOString() : null,
      notes: notes || null,
      status: 'active',
      reminder_sequence_status: 'active',
    })

    if (bhphErr) return NextResponse.json({ error: bhphErr.message }, { status: 500 })

    // 3. Auto-create first payment follow-up task
    await service.from('activities').insert({
      user_id: orgId,
      customer_id,
      vehicle_id,
      type: 'task',
      body: `BHPH payment #1 due — ${payment_frequency ?? 'monthly'} — $${monthly_payment}`,
      due_at: new Date(first_due_date + 'T09:00:00').toISOString(),
      priority: 'high',
    })
  }

  return NextResponse.json({ success: true })
}
