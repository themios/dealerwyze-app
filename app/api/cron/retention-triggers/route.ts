/**
 * GET /api/cron/retention-triggers
 * Daily cron: scans all orgs with retention_settings configured,
 * evaluates birthday / sale_anniversary / service_due / post_sale / referral_thankyou
 * triggers, and auto-enrolls matching customers into the configured sequences.
 *
 * Schedule: 0 17 * * * (daily at 9am PT / 5pm UTC) — offset from check-tasks
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { enrollCustomer } from '@/lib/sequences/enrollCustomer'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

export const runtime    = 'nodejs'
export const maxDuration = 55

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId    = await startCronRun('retention-triggers')
  const supabase = createServiceClient()

  const now    = new Date()
  const todayM = now.getUTCMonth() + 1   // 1-12
  const todayD = now.getUTCDate()         // 1-31

  let enrolled = 0
  let skipped  = 0

  // Fetch all orgs that have at least one retention sequence configured
  const { data: settings } = await supabase
    .from('retention_settings')
    .select(`
      org_id,
      birthday_sequence_id, birthday_days_before,
      anniversary_sequence_id, anniversary_days_before,
      service_due_sequence_id, service_due_days,
      post_sale_sequence_id, post_sale_delay_days,
      referral_thankyou_sequence_id
    `)

  for (const s of settings ?? []) {
    // ── BIRTHDAY trigger ────────────────────────────────────────────────────
    if (s.birthday_sequence_id) {
      const targetDate = new Date(now)
      targetDate.setUTCDate(targetDate.getUTCDate() + (s.birthday_days_before ?? 0))
      const bM = targetDate.getUTCMonth() + 1
      const bD = targetDate.getUTCDate()

      const { data: bdayCustomers } = await supabase
        .from('customers')
        .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms, birthday')
        .eq('user_id', s.org_id)
        .filter('birthday', 'not.is', null)
        .is('merged_at', null)

      for (const c of bdayCustomers ?? []) {
        if (!c.birthday) continue
        const bd = new Date(c.birthday)
        if (bd.getUTCMonth() + 1 !== bM || bd.getUTCDate() !== bD) continue

        // Dedup: skip if already enrolled this calendar year
        const yearStart = `${now.getUTCFullYear()}-01-01`
        const { data: existing } = await supabase
          .from('customer_sequences')
          .select('id')
          .eq('customer_id', c.id)
          .eq('sequence_id', s.birthday_sequence_id)
          .gte('enrolled_at', yearStart)
          .maybeSingle()
        if (existing) { skipped++; continue }

        const result = await enrollForTrigger(supabase, s.org_id, c, s.birthday_sequence_id)
        if (result.ok) enrolled++; else skipped++
      }
    }

    // ── SALE ANNIVERSARY trigger ─────────────────────────────────────────────
    if (s.anniversary_sequence_id) {
      const targetDate = new Date(now)
      targetDate.setUTCDate(targetDate.getUTCDate() + (s.anniversary_days_before ?? 0))
      const aM = targetDate.getUTCMonth() + 1
      const aD = targetDate.getUTCDate()

      // Find customer_vehicles sold in a prior year on this month+day
      const { data: anniversaries } = await supabase
        .from('customer_vehicles')
        .select('customer_id, created_at, customers!inner(id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms, user_id)')
        .filter('customers.user_id', 'eq', s.org_id)

      for (const cv of anniversaries ?? []) {
        const saleDate  = new Date(cv.created_at)
        const saleYear  = saleDate.getUTCFullYear()
        if (saleYear === now.getUTCFullYear()) continue   // exclude year-of-sale
        if (saleDate.getUTCMonth() + 1 !== aM || saleDate.getUTCDate() !== aD) continue

        const customer = Array.isArray(cv.customers) ? cv.customers[0] : cv.customers
        if (!customer) continue

        const yearStart = `${now.getUTCFullYear()}-01-01`
        const { data: existing } = await supabase
          .from('customer_sequences')
          .select('id')
          .eq('customer_id', cv.customer_id)
          .eq('sequence_id', s.anniversary_sequence_id)
          .gte('enrolled_at', yearStart)
          .maybeSingle()
        if (existing) { skipped++; continue }

        const result = await enrollForTrigger(supabase, s.org_id, customer, s.anniversary_sequence_id)
        if (result.ok) enrolled++; else skipped++
      }
    }

    // ── SERVICE DUE trigger ─────────────────────────────────────────────────
    if (s.service_due_sequence_id) {
      const dueDaysAgo = new Date(now)
      dueDaysAgo.setUTCDate(dueDaysAgo.getUTCDate() - (s.service_due_days ?? 60))

      const { data: serviceCustomers } = await supabase
        .from('customers')
        .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms')
        .eq('user_id', s.org_id)
        .not('last_service_date', 'is', null)
        .lte('last_service_date', dueDaysAgo.toISOString().slice(0, 10))
        .is('merged_at', null)

      for (const c of serviceCustomers ?? []) {
        const { data: existing } = await supabase
          .from('customer_sequences')
          .select('id')
          .eq('customer_id', c.id)
          .eq('sequence_id', s.service_due_sequence_id)
          .in('status', ['active', 'paused'])
          .maybeSingle()
        if (existing) { skipped++; continue }

        const result = await enrollForTrigger(supabase, s.org_id, c, s.service_due_sequence_id)
        if (result.ok) enrolled++; else skipped++
      }
    }

    // ── POST SALE trigger ───────────────────────────────────────────────────
    if (s.post_sale_sequence_id) {
      const delayDaysAgo = new Date(now)
      delayDaysAgo.setUTCDate(delayDaysAgo.getUTCDate() - (s.post_sale_delay_days ?? 7))
      const windowStart = new Date(delayDaysAgo)
      windowStart.setUTCHours(0, 0, 0, 0)
      const windowEnd = new Date(windowStart)
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1)

      const { data: postSaleVehicles } = await supabase
        .from('customer_vehicles')
        .select('customer_id, created_at, customers!inner(id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms, user_id)')
        .filter('customers.user_id', 'eq', s.org_id)
        .gte('created_at', windowStart.toISOString())
        .lt('created_at', windowEnd.toISOString())

      for (const cv of postSaleVehicles ?? []) {
        const customer = Array.isArray(cv.customers) ? cv.customers[0] : cv.customers
        if (!customer) continue

        // Dedup: only one post_sale enrollment per customer
        const { data: existing } = await supabase
          .from('customer_sequences')
          .select('id')
          .eq('customer_id', cv.customer_id)
          .eq('sequence_id', s.post_sale_sequence_id)
          .maybeSingle()
        if (existing) { skipped++; continue }

        const result = await enrollForTrigger(supabase, s.org_id, customer, s.post_sale_sequence_id)
        if (result.ok) enrolled++; else skipped++
      }
    }

    // ── REFERRAL THANK-YOU trigger ──────────────────────────────────────────
    // Fires once per NEW referral (customers.referred_by set + created in last 24h)
    if (s.referral_thankyou_sequence_id) {
      const yesterday = new Date(now)
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)

      const { data: newReferrals } = await supabase
        .from('customers')
        .select('id, referred_by')
        .eq('user_id', s.org_id)
        .not('referred_by', 'is', null)
        .gte('created_at', yesterday.toISOString())
        .is('merged_at', null)

      for (const ref of newReferrals ?? []) {
        if (!ref.referred_by) continue

        // Fetch the referrer customer record
        const { data: referrer } = await supabase
          .from('customers')
          .select('id, name, email, primary_phone, unsubscribe_email, unsubscribe_sms')
          .eq('id', ref.referred_by)
          .eq('user_id', s.org_id)
          .maybeSingle()
        if (!referrer) continue

        // Dedup: skip if referrer already has active/paused enrollment in this sequence
        const { data: existing } = await supabase
          .from('customer_sequences')
          .select('id')
          .eq('customer_id', referrer.id)
          .eq('sequence_id', s.referral_thankyou_sequence_id)
          .in('status', ['active', 'paused'])
          .maybeSingle()
        if (existing) { skipped++; continue }

        const result = await enrollForTrigger(supabase, s.org_id, referrer, s.referral_thankyou_sequence_id)
        if (result.ok) enrolled++; else skipped++
      }
    }
  }

  await finishCronRun(runId, 'success', enrolled)
  return NextResponse.json({ ok: true, enrolled, skipped })
}

// ── Helper: fetch sequence + steps then enroll ────────────────────────────────
async function enrollForTrigger(
  supabase: ReturnType<typeof createServiceClient>,
  orgId:      string,
  customer:   { id: string; name: string; email: string | null; primary_phone: string; unsubscribe_email?: boolean; unsubscribe_sms?: boolean },
  sequenceId: string,
) {
  const { data: sequence } = await supabase
    .from('sequences')
    .select('id, name, channel, auto_mode')
    .eq('id', sequenceId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!sequence) return { ok: false }

  const { data: steps } = await supabase
    .from('sequence_steps')
    .select('id, sort_order, day_offset, send_hour, template_id, template:templates(id, name, subject, body)')
    .eq('sequence_id', sequenceId)
    .order('sort_order', { ascending: true })
  if (!steps || steps.length === 0) return { ok: false }

  return enrollCustomer({
    supabase,
    orgId,
    customer,
    sequence,
    steps: steps as unknown as Parameters<typeof enrollCustomer>[0]['steps'],
  })
}
