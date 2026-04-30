/**
 * BHPH Payment Reminder Cron Endpoint
 *
 * Called daily by cron-job.org (or Vercel cron).
 * Runs at 17:00 UTC = 10:00 AM PT — within the 9am-7pm send window.
 *
 * Auth: Bearer CRON_SECRET header
 * Set on cron-job.org as: Authorization: Bearer <your CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendBhphReminder } from '@/lib/bhph/send'
import { todayInTimezone, daysBetween } from '@/lib/bhph/schedule'
import type { ReminderType } from '@/lib/bhph/messages'

export const runtime = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // Load all active BHPH contracts with customer + vehicle (no profiles join — user_id FKs to auth.users)
  const { data: contracts, error } = await service
    .from('bhph_payments')
    .select(`
      id, user_id, customer_id, vehicle_id,
      monthly_payment, next_due_date, payment_frequency,
      last_reminder_type, reminder_sequence_status,
      sms_consent, email_consent, customer_email,
      customer:customers(id, name, primary_phone, sms_opt_out),
      vehicle:vehicles(year, make, model)
    `)
    .eq('status', 'active')
    .eq('reminder_sequence_status', 'active')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dealerPhone = process.env.DEALER_PHONE ?? '(805) 555-0100'
  const results: Record<string, unknown>[] = []

  type CustomerRow = { id: string; name: string; primary_phone: string; sms_opt_out?: boolean }
  type VehicleRow = { year: number; make: string; model: string }

  for (const contract of contracts ?? []) {
    const rawCustomer = contract.customer as unknown
    const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as CustomerRow | null
    const rawVehicle = contract.vehicle as unknown
    const vehicle = (Array.isArray(rawVehicle) ? rawVehicle[0] : rawVehicle) as VehicleRow | null

    if (!customer || !vehicle) continue

    const { data: orgSettings } = await service
      .from('org_settings')
      .select('business_name, timezone')
      .eq('org_id', contract.user_id)
      .maybeSingle()
    const tz: string = orgSettings?.timezone ?? 'America/Los_Angeles'
    const dealerName = orgSettings?.business_name ?? 'the dealership'

    const today = todayInTimezone(tz)
    const daysUntilDue = daysBetween(today, contract.next_due_date)

    // Determine which reminder stage we're in
    let reminderType: ReminderType | null = null
    if (daysUntilDue === 3 && contract.last_reminder_type !== 'pre_3day') {
      reminderType = 'pre_3day'
    } else if (daysUntilDue === 0 && contract.last_reminder_type !== 'due_day') {
      reminderType = 'due_day'
    } else if (daysUntilDue === -2 && contract.last_reminder_type !== 'late_2day') {
      reminderType = 'late_2day'
    } else if (daysUntilDue === -7 && contract.last_reminder_type !== 'late_7day') {
      reminderType = 'late_7day'
    }

    if (!reminderType) continue

    const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

    if (!contract.sms_consent && !contract.email_consent) continue

    const sendResult = await sendBhphReminder({
      bhphId: contract.id,
      userId: contract.user_id,
      customerId: contract.customer_id,
      customerPhone: customer.primary_phone,
      customerEmail: contract.customer_email ?? null,
      customerSmsOptedOut: customer.sms_opt_out ?? false,
      smsConsent: contract.sms_consent ?? false,
      emailConsent: contract.email_consent ?? false,
      reminderType,
      dealerTimezone: tz,
      dealerPhone,
      amount: contract.monthly_payment,
      messageVars: {
        customerName: customer.name,
        amount: contract.monthly_payment,
        dueDate: contract.next_due_date,
        dealerPhone,
        dealerName,
        vehicleLabel,
        paymentContext: 'loan',
      },
    })

    // Update last_reminder_type on the contract
    if (sendResult.sms === 'sent' || sendResult.email === 'sent') {
      await service
        .from('bhph_payments')
        .update({
          last_reminder_type: reminderType,
          last_reminder_at: new Date().toISOString(),
        })
        .eq('id', contract.id)
    }

    results.push({ contractId: contract.id, customer: customer.name, reminderType, ...sendResult })
  }

  const { data: deferredPayments, error: deferredError } = await service
    .from('bhph_deferred_payments')
    .select(`
      id, user_id, bhph_id, customer_id, vehicle_id,
      amount, due_date, status,
      last_reminder_type, reminder_sequence_status,
      customer:customers(id, name, primary_phone, sms_opt_out),
      vehicle:vehicles(year, make, model)
    `)
    .eq('status', 'scheduled')
    .eq('reminder_sequence_status', 'active')

  if (deferredError) {
    return NextResponse.json({ error: deferredError.message }, { status: 500 })
  }

  for (const installment of deferredPayments ?? []) {
    const rawCustomer = installment.customer as unknown
    const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as CustomerRow | null
    const rawVehicle = installment.vehicle as unknown
    const vehicle = (Array.isArray(rawVehicle) ? rawVehicle[0] : rawVehicle) as VehicleRow | null

    if (!customer || !vehicle) continue

    const { data: contract } = await service
      .from('bhph_payments')
      .select('sms_consent, email_consent, customer_email')
      .eq('id', installment.bhph_id)
      .eq('user_id', installment.user_id)
      .maybeSingle()

    if (!contract?.sms_consent && !contract?.email_consent) continue

    const { data: orgSettings } = await service
      .from('org_settings')
      .select('business_name, timezone')
      .eq('org_id', installment.user_id)
      .maybeSingle()
    const tz: string = orgSettings?.timezone ?? 'America/Los_Angeles'
    const dealerName = orgSettings?.business_name ?? 'the dealership'

    const today = todayInTimezone(tz)
    const daysUntilDue = daysBetween(today, installment.due_date)

    let reminderType: ReminderType | null = null
    if (daysUntilDue === 3 && installment.last_reminder_type !== 'pre_3day') {
      reminderType = 'pre_3day'
    } else if (daysUntilDue === 0 && installment.last_reminder_type !== 'due_day') {
      reminderType = 'due_day'
    } else if (daysUntilDue === -2 && installment.last_reminder_type !== 'late_2day') {
      reminderType = 'late_2day'
    } else if (daysUntilDue === -7 && installment.last_reminder_type !== 'late_7day') {
      reminderType = 'late_7day'
    }

    if (!reminderType) continue

    const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    const sendResult = await sendBhphReminder({
      bhphId: installment.bhph_id,
      userId: installment.user_id,
      customerId: installment.customer_id,
      customerPhone: customer.primary_phone,
      customerEmail: contract.customer_email ?? null,
      customerSmsOptedOut: customer.sms_opt_out ?? false,
      smsConsent: contract.sms_consent ?? false,
      emailConsent: contract.email_consent ?? false,
      reminderType,
      dealerTimezone: tz,
      dealerPhone,
      amount: undefined,
      messageVars: {
        customerName: customer.name,
        amount: installment.amount,
        dueDate: installment.due_date,
        dealerPhone,
        dealerName,
        vehicleLabel,
        paymentContext: 'deferred_down_payment',
      },
    })

    if (sendResult.sms === 'sent' || sendResult.email === 'sent') {
      await service
        .from('bhph_deferred_payments')
        .update({
          last_reminder_type: reminderType,
          last_reminder_at: new Date().toISOString(),
        })
        .eq('id', installment.id)
    }

    results.push({ deferredPaymentId: installment.id, customer: customer.name, reminderType, ...sendResult })
  }

  return NextResponse.json({
    processed: results.length,
    results,
    ran_at: new Date().toISOString(),
  })
}
