/**
 * POST /api/bhph/create
 * Creates a BHPH contract when a vehicle is marked as sold.
 * Runs server-side to correctly set user_id = org_id and capture consent.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { CONSENT_DISCLOSURE } from '@/lib/bhph/schedule'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import { deliverPulseSurvey } from '@/lib/pulse/deliver'
import { recordDealIntentOutcome } from '@/lib/leads/dealLearning'
import type { UserRole } from '@/types/index'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

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
    required_down_payment,
    deferred_payments,
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
  const requiredDownValue = required_down_payment ? parseFloat(String(required_down_payment)) : 0
  const actualDownValue = down_payment ? parseFloat(String(down_payment)) : 0
  const deferredRows = Array.isArray(deferred_payments)
    ? deferred_payments
        .map((row: unknown) => row as { amount?: unknown; due_date?: unknown; notes?: unknown })
        .map(row => ({
          amount: typeof row.amount === 'number' ? row.amount : parseFloat(String(row.amount ?? '0')),
          due_date: String(row.due_date ?? ''),
          notes: row.notes ? String(row.notes).trim().slice(0, 500) : null,
        }))
        .filter(row => row.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date))
    : []

  if (finance_type === 'bhph') {
    const remainingDown = Math.max(0, Math.round((requiredDownValue - actualDownValue) * 100) / 100)
    const deferredTotal = Math.round(deferredRows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100
    if (deferredRows.length > 0 && remainingDown <= 0) {
      return NextResponse.json({ error: 'Deferred down payment requires a remaining balance' }, { status: 400 })
    }
    if (deferredRows.length > 0 && Math.abs(deferredTotal - remainingDown) > 0.01) {
      return NextResponse.json({ error: 'Deferred payments must equal the remaining down payment balance' }, { status: 400 })
    }
  }
  const { error: finalizeError } = await supabase.rpc('finalize_bhph_sale_with_deferred', {
    p_org_id: orgId,
    p_vehicle_id: vehicle_id,
    p_customer_id: customer_id || null,
    p_sold_price: parseFloat(sold_price),
    p_finance_type: finance_type,
    p_finance_company: finance_company || null,
    p_down_payment: finance_type === 'bhph' ? actualDownValue : null,
    p_required_down_payment: finance_type === 'bhph' ? requiredDownValue || null : null,
    p_loan_amount: finance_type === 'bhph' && loan_amount ? parseFloat(loan_amount) : null,
    p_monthly_payment: finance_type === 'bhph' && monthly_payment ? parseFloat(monthly_payment) : null,
    p_payment_frequency: finance_type === 'bhph' ? payment_frequency ?? 'monthly' : null,
    p_payment_day: finance_type === 'bhph' ? parseInt(payment_day) || 1 : null,
    p_first_due_date: finance_type === 'bhph' && first_due_date ? first_due_date : null,
    p_customer_email: finance_type === 'bhph' ? customer_email || null : null,
    p_sms_consent: finance_type === 'bhph' ? Boolean(sms_consent) : false,
    p_sms_consent_at: finance_type === 'bhph' && sms_consent ? new Date().toISOString() : null,
    p_sms_consent_ip: finance_type === 'bhph' && sms_consent ? clientIp : null,
    p_sms_consent_disclosure: finance_type === 'bhph' && sms_consent ? CONSENT_DISCLOSURE : null,
    p_email_consent: finance_type === 'bhph' ? Boolean(email_consent) : false,
    p_email_consent_at: finance_type === 'bhph' && email_consent ? new Date().toISOString() : null,
    p_notes: notes || null,
    p_deferred_payments: finance_type === 'bhph' ? deferredRows : [],
  })

  if (finalizeError) return NextResponse.json({ error: finalizeError.message }, { status: 500 })

  if (customer_id) {
    try {
      await recordDealIntentOutcome(supabase, {
        orgId,
        customerId: customer_id,
        vehicleId: vehicle_id,
        isBuyer: true,
      })
    } catch (e) {
      console.error('[bhph/create] recordDealIntentOutcome buyer', e)
    }
  }

  // Trigger pulse survey for the buyer (non-blocking)
  if (customer_id) {
    deliverPulseSurvey({
      orgId:       orgId,
      customerId:  customer_id,
      triggerType: 'sold',
    }).catch(() => {})
  }

  // Find other customers who expressed interest in this vehicle
  interface InterestedCustomer { customer_id: string; name: string; primary_phone: string | null; email: string | null; is_buyer?: boolean }
  const interestedCustomers: InterestedCustomer[] = []
  const seen = new Set<string>()

  // Prepend the buyer so they get a thank-you message first
  if (customer_id) {
    const { data: buyer } = await supabase
      .from('customers')
      .select('id, name, primary_phone, email')
      .eq('id', customer_id)
      .single()
    if (buyer) {
      interestedCustomers.push({
        customer_id: buyer.id,
        name: buyer.name ?? '',
        primary_phone: buyer.primary_phone ?? null,
        email: buyer.email ?? null,
        is_buyer: true,
      })
    }
  }
  if (customer_id) seen.add(customer_id) // exclude the buyer

  const [{ data: cvRows }, { data: matchRows }] = await Promise.all([
    supabase
      .from('customer_vehicles')
      .select('customer_id, customer:customers(id, name, primary_phone, email)')
      .eq('vehicle_id', vehicle_id),
    supabase
      .from('activities')
      .select('customer_id, customer:customers(id, name, primary_phone, email)')
      .eq('user_id', orgId)
      .eq('vehicle_id', vehicle_id)
      .eq('type', 'vehicle_match')
      .eq('direction', 'inbound')
      .is('completed_at', null),
  ])

  for (const row of [...(cvRows ?? []), ...(matchRows ?? [])]) {
    if (!row.customer_id || seen.has(row.customer_id)) continue
    seen.add(row.customer_id)
    const c = Array.isArray(row.customer) ? row.customer[0] : row.customer
    if (!c) continue
    interestedCustomers.push({
      customer_id: row.customer_id,
      name: (c as Record<string, string>).name ?? '',
      primary_phone: (c as Record<string, string | null>).primary_phone ?? null,
      email: (c as Record<string, string | null>).email ?? null,
    })
  }

  const learningTasks: Promise<void>[] = []
  for (const ic of interestedCustomers) {
    if (ic.is_buyer) continue
    learningTasks.push(
      recordDealIntentOutcome(supabase, {
        orgId,
        customerId: ic.customer_id,
        vehicleId: vehicle_id,
        isBuyer: false,
      }).catch(err => {
        console.error('[bhph/create] recordDealIntentOutcome interested', ic.customer_id, err)
      }),
    )
  }
  await Promise.all(learningTasks)

  return NextResponse.json({ success: true, interestedCustomers })
}
