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

  // Load all active BHPH contracts with customer + vehicle + org timezone
  const { data: contracts, error } = await service
    .from('bhph_payments')
    .select(`
      id, user_id, customer_id, vehicle_id,
      monthly_payment, next_due_date, payment_frequency,
      last_reminder_type, reminder_sequence_status,
      sms_consent, email_consent, customer_email,
      customer:customers(id, name, primary_phone, sms_opted_out),
      vehicle:vehicles(year, make, model),
      org:profiles!user_id(timezone)
    `)
    .eq('status', 'active')
    .eq('reminder_sequence_status', 'active')
    .eq('sms_consent', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const dealerPhone = process.env.DEALER_PHONE ?? '(805) 555-0100'
  const results: Record<string, unknown>[] = []

  for (const contract of contracts ?? []) {
    const customer = contract.customer as any
    const vehicle = contract.vehicle as any
    const org = contract.org as any

    if (!customer || !vehicle) continue

    const tz: string = org?.timezone ?? 'America/Los_Angeles'
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

    const { data: orgSettings } = await service
      .from('org_settings')
      .select('business_name')
      .eq('org_id', contract.user_id)
      .maybeSingle()
    const dealerName = orgSettings?.business_name ?? 'the dealership'

    const sendResult = await sendBhphReminder({
      bhphId: contract.id,
      userId: contract.user_id,
      customerId: contract.customer_id,
      customerPhone: customer.primary_phone,
      customerEmail: contract.customer_email ?? null,
      customerSmsOptedOut: customer.sms_opted_out ?? false,
      reminderType,
      dealerTimezone: tz,
      dealerPhone,
      messageVars: {
        customerName: customer.name,
        amount: contract.monthly_payment,
        dueDate: contract.next_due_date,
        dealerPhone,
        dealerName,
        vehicleLabel,
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

  return NextResponse.json({
    processed: results.length,
    results,
    ran_at: new Date().toISOString(),
  })
}
