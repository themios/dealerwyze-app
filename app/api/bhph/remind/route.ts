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
import { sendBhphReminder, type BhphReminderTwoTier } from '@/lib/bhph/send'
import { todayInTimezone, daysBetween } from '@/lib/bhph/schedule'
import type { ReminderType } from '@/lib/bhph/messages'
import { getOrCreatePaymentToken, buildPayUrl } from '@/lib/bhph/paymentToken'
import { generateAchSetupToken } from '@/lib/bhph/achSetupToken'
import {
  createStripeAchPaymentIntent,
  finalizeBhphPaymentRpc,
  getOrCreateAchPullToken,
  recordAchFailureLedger,
} from '@/lib/bhph/achPull'
import { sendTwilioSms, toE164Us } from '@/lib/bhph/twilioOutbound'

export const runtime = 'nodejs'
export const maxDuration = 55

type OrgBhphRow = {
  business_name: string | null
  timezone: string
  bhph_zelle_handle: string | null
  bhph_venmo_handle: string | null
  bhph_cashapp_handle: string | null
  bhph_manual_instructions_enabled: boolean
  bhph_ach_prompts_enabled: boolean
}

async function loadOrgBhph(
  service: ReturnType<typeof createServiceClient>,
  cache: Map<string, OrgBhphRow>,
  orgId: string,
): Promise<OrgBhphRow> {
  const hit = cache.get(orgId)
  if (hit) return hit
  const { data } = await service
    .from('org_settings')
    .select(`
      business_name, timezone,
      bhph_zelle_handle, bhph_venmo_handle, bhph_cashapp_handle,
      bhph_manual_instructions_enabled, bhph_ach_prompts_enabled
    `)
    .eq('org_id', orgId)
    .maybeSingle()
  const row: OrgBhphRow = {
    business_name: (data?.business_name as string | null) ?? null,
    timezone: (data?.timezone as string) ?? 'America/Los_Angeles',
    bhph_zelle_handle: (data?.bhph_zelle_handle as string | null) ?? null,
    bhph_venmo_handle: (data?.bhph_venmo_handle as string | null) ?? null,
    bhph_cashapp_handle: (data?.bhph_cashapp_handle as string | null) ?? null,
    bhph_manual_instructions_enabled: !!(data?.bhph_manual_instructions_enabled),
    bhph_ach_prompts_enabled: data?.bhph_ach_prompts_enabled !== false,
  }
  cache.set(orgId, row)
  return row
}

async function buildReminderPayPayload(
  service: ReturnType<typeof createServiceClient>,
  contract: {
    id: string
    user_id: string
    customer_id: string
    monthly_payment: number
    payment_method_type?: string | null
    bank_verification_status?: string | null
  },
  org: OrgBhphRow,
  tokenAmount: number,
): Promise<{
  paymentUrl: string | null
  paymentTokenId: string | null
  twoTier: BhphReminderTwoTier
}> {
  const achVerified =
    contract.payment_method_type === 'ach' &&
    contract.bank_verification_status === 'verified'

  let paymentUrl: string | null = null
  let paymentTokenId: string | null = null

  if (!achVerified && tokenAmount > 0) {
    const t = await getOrCreatePaymentToken({
      orgId: contract.user_id,
      customerId: contract.customer_id,
      bhphContractId: contract.id,
      amount: tokenAmount,
    }).catch(() => null)
    if (t) {
      paymentTokenId = t.id
      paymentUrl = buildPayUrl(t.token)
    }
  }

  let achSetupUrl: string | null = null
  const achPrompts = org.bhph_ach_prompts_enabled !== false
  const needAchLink =
    !achVerified &&
    contract.payment_method_type !== 'ach' &&
    contract.bank_verification_status !== 'verified'

  if (needAchLink && achPrompts) {
    try {
      const secret = process.env.BHPH_ACH_SECRET
      if (secret && secret.length >= 16) {
        const tok = generateAchSetupToken(contract.id)
        const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
        achSetupUrl = `${base}/pay/ach/${encodeURIComponent(tok)}`
      }
    } catch (e) {
      console.error('[bhph/remind] ach setup token', e)
    }
  }

  return {
    paymentUrl,
    paymentTokenId,
    twoTier: {
      achVerified,
      achSetupUrl,
      achPromptsEnabled: achPrompts,
      manualInstructionsEnabled: org.bhph_manual_instructions_enabled,
      zelle: org.bhph_zelle_handle,
      venmo: org.bhph_venmo_handle,
      cashapp: org.bhph_cashapp_handle,
    },
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // Load all active BHPH contracts with customer + vehicle (no profiles join — user_id FKs to auth.users)
  const orgBhphCache = new Map<string, OrgBhphRow>()

  const { data: contracts, error } = await service
    .from('bhph_payments')
    .select(`
      id, user_id, customer_id, vehicle_id,
      monthly_payment, next_due_date, payment_frequency,
      last_reminder_type, reminder_sequence_status,
      sms_consent, email_consent, customer_email,
      payment_method_type, bank_verification_status,
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

    const orgRow = await loadOrgBhph(service, orgBhphCache, contract.user_id as string)
    const tz: string = orgRow.timezone
    const dealerName = orgRow.business_name ?? 'the dealership'

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

    const payPayload = await buildReminderPayPayload(
      service,
      {
        id: contract.id as string,
        user_id: contract.user_id as string,
        customer_id: contract.customer_id as string,
        monthly_payment: Number(contract.monthly_payment),
        payment_method_type: contract.payment_method_type as string | null | undefined,
        bank_verification_status: contract.bank_verification_status as string | null | undefined,
      },
      orgRow,
      Number(contract.monthly_payment),
    )

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
      paymentUrl: payPayload.paymentUrl,
      paymentTokenId: payPayload.paymentTokenId,
      twoTier: payPayload.twoTier,
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

    const orgRow = await loadOrgBhph(service, orgBhphCache, installment.user_id as string)
    const tz: string = orgRow.timezone
    const dealerName = orgRow.business_name ?? 'the dealership'

    const { data: bhphParent } = await service
      .from('bhph_payments')
      .select('payment_method_type, bank_verification_status')
      .eq('id', installment.bhph_id)
      .eq('user_id', installment.user_id)
      .maybeSingle()

    const instAmount = Number(installment.amount)
    const payPayload = await buildReminderPayPayload(
      service,
      {
        id: installment.bhph_id as string,
        user_id: installment.user_id as string,
        customer_id: installment.customer_id as string,
        monthly_payment: instAmount,
        payment_method_type: bhphParent?.payment_method_type as string | null | undefined,
        bank_verification_status: bhphParent?.bank_verification_status as string | null | undefined,
      },
      orgRow,
      instAmount,
    )

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
      amount: installment.amount,
      paymentUrl: payPayload.paymentUrl,
      paymentTokenId: payPayload.paymentTokenId,
      twoTier: payPayload.twoTier,
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

  const achResults: Record<string, unknown>[] = []
  const { data: achList, error: achErr } = await service
    .from('bhph_payments')
    .select(
      'id, user_id, customer_id, monthly_payment, next_due_date, stripe_customer_id, stripe_payment_method_id, payment_method_type, bank_verification_status, status',
    )
    .eq('status', 'active')
    .eq('payment_method_type', 'ach')
    .eq('bank_verification_status', 'verified')

  if (!achErr && achList?.length) {
    for (const c of achList) {
      const orgId = c.user_id as string
      const { data: orgSettings } = await service
        .from('org_settings')
        .select('timezone, stripe_dealer_secret_key, dealer_cell_number')
        .eq('org_id', orgId)
        .maybeSingle()

      const tz: string = orgSettings?.timezone ?? 'America/Los_Angeles'
      const today = todayInTimezone(tz)
      const due = (c.next_due_date as string).slice(0, 10)
      if (due !== today) continue

      const secret = orgSettings?.stripe_dealer_secret_key as string | null
      const custId = c.stripe_customer_id as string | null
      const pmId = c.stripe_payment_method_id as string | null
      if (!secret?.trim() || !custId || !pmId) {
        achResults.push({ contractId: c.id, ach: 'skipped_missing_stripe' })
        continue
      }

      const monthly = Number(c.monthly_payment)
      const tokenRow = await getOrCreateAchPullToken(service, {
        orgId,
        customerId: c.customer_id as string,
        bhphContractId: c.id as string,
        amount: monthly,
      })
      if (!tokenRow) {
        achResults.push({ contractId: c.id, ach: 'token_failed' })
        continue
      }

      const cents = Math.round(monthly * 100)
      const pi = await createStripeAchPaymentIntent({
        secretKey: secret,
        customerId: custId,
        paymentMethodId: pmId,
        amountCents: cents,
        tokenRowId: tokenRow.id,
        bhphContractId: c.id as string,
        orgId,
        paymentDateYmd: today,
      })

      if (!pi) {
        await recordAchFailureLedger({
          supabase: service,
          contractId: c.id as string,
          paymentDateYmd: today,
          attemptedAmount: monthly,
          stripePaymentIntentId: null,
          notes: 'ACH auto-pull: PaymentIntent creation failed',
        })
        const raw = orgSettings?.dealer_cell_number as string | null
        const to = raw ? toE164Us(raw) : null
        if (to) {
          void sendTwilioSms(
            to,
            'DealerWyze: ACH auto-payment could not be started for a due contract. Check Stripe and the BHPH account.',
          )
        }
        achResults.push({ contractId: c.id, ach: 'pi_create_failed' })
        continue
      }

      if (pi.status === 'succeeded') {
        const paidAt = new Date().toISOString()
        const fin = await finalizeBhphPaymentRpc({
          supabase: service,
          tokenId: tokenRow.id,
          paymentIntentId: pi.id,
          paidAtIso: paidAt,
          amount: monthly,
          paymentDateYmd: today,
        })
        achResults.push({ contractId: c.id, ach: 'finalized', ...fin })
      } else if (pi.status === 'processing' || pi.status === 'requires_action') {
        achResults.push({ contractId: c.id, ach: 'pending_webhook', paymentIntent: pi.id, status: pi.status })
      } else {
        await recordAchFailureLedger({
          supabase: service,
          contractId: c.id as string,
          paymentDateYmd: today,
          attemptedAmount: monthly,
          stripePaymentIntentId: pi.id,
          notes: `ACH auto-pull declined: status=${pi.status}`,
        })
        const raw = orgSettings?.dealer_cell_number as string | null
        const to = raw ? toE164Us(raw) : null
        if (to) {
          void sendTwilioSms(
            to,
            'DealerWyze: ACH payment was not successful for a due BHPH contract. Follow up with the customer.',
          )
        }
        achResults.push({ contractId: c.id, ach: 'failed', paymentIntent: pi.id, status: pi.status })
      }
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    ach_pulls: achResults,
    ran_at: new Date().toISOString(),
  })
}
