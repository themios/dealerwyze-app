import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { logAdminAction } from '@/lib/admin/audit'
import { requirePlatformArea } from '@/lib/auth/platform'
import { stripe } from '@/lib/stripe'

const SMS_PLANS: Record<string, { quota: number; label: string }> = {
  tier1: { quota: 1000,  label: 'Tier 1 — 1,000 msgs/mo' },
  tier2: { quota: 3000,  label: 'Tier 2 — 3,000 msgs/mo' },
  tier3: { quota: 10000, label: 'Tier 3 — 10,000 msgs/mo' },
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [
    { data: org },
    { data: settings },
    { data: team },
    { data: voiceCalls },
    { count: leadsCount },
  ] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).single(),
    supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase.from('profiles').select('id, display_name, role, created_at').eq('org_id', orgId),
    supabase.from('voice_calls').select('duration').eq('org_id', orgId).gte('created_at', since30d),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', orgId).gte('created_at', since30d),
  ])

  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const voiceMinutes = Math.round(
    (voiceCalls?.reduce((s, c) => s + (c.duration ?? 0), 0) ?? 0) / 60,
  )

  // Fetch Stripe invoices if customer exists
  let stripeInvoices: { id: string; date: string; amount: number; status: string; pdf: string | null }[] = []
  if (org.stripe_customer_id) {
    try {
      const invoices = await stripe.invoices.list({
        customer: org.stripe_customer_id,
        limit: 12,
      })
      stripeInvoices = invoices.data.map(inv => ({
        id:     inv.id,
        date:   new Date((inv.created ?? 0) * 1000).toISOString(),
        amount: (inv.amount_paid ?? 0) / 100,
        status: inv.status ?? 'unknown',
        pdf:    inv.invoice_pdf ?? null,
      }))
    } catch {
      // Stripe call failed — non-fatal
    }
  }

  return NextResponse.json({
    org,
    settings,
    team: team ?? [],
    stats: {
      voice_calls_30d:   voiceCalls?.length ?? 0,
      voice_minutes_30d: voiceMinutes,
      leads_30d:         leadsCount ?? 0,
    },
    stripe_invoices: stripeInvoices,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { id: orgId } = await params
  const supabase = createServiceClient()
  const body = await req.json() as {
    action: string
    plan?: string
    subscription_status?: string
    sms_plan?: string
    sms_overage_enabled?: boolean
    trial_end?: string           // ISO date string for set_trial_end
    cancel_at_period_end?: boolean
    credit_amount?: number       // in dollars
    credit_description?: string
    suspension_reason?: string
  }

  const now = new Date().toISOString()

  if (body.action === 'update_plan') {
    const { error } = await supabase
      .from('organizations')
      .update({ plan: body.plan, subscription_status: body.subscription_status, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'update_plan', orgId, { plan: body.plan, subscription_status: body.subscription_status })
  }

  else if (body.action === 'update_sms_plan') {
    const tier = SMS_PLANS[body.sms_plan ?? '']
    if (!tier) return NextResponse.json({ error: 'Invalid sms_plan' }, { status: 400 })
    const { error } = await supabase
      .from('organizations')
      .update({ sms_plan: body.sms_plan, sms_quota: tier.quota, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'update_sms_plan', orgId, { sms_plan: body.sms_plan, sms_quota: tier.quota })
  }

  else if (body.action === 'toggle_overage') {
    const { error } = await supabase
      .from('organizations')
      .update({ sms_overage_enabled: body.sms_overage_enabled, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'toggle_overage', orgId, { enabled: body.sms_overage_enabled })
  }

  else if (body.action === 'reset_billing') {
    const today = new Date()
    const cycleEnd = new Date(today)
    cycleEnd.setMonth(cycleEnd.getMonth() + 1)
    const { error } = await supabase
      .from('organizations')
      .update({
        billing_cycle_start:   today.toISOString().split('T')[0],
        billing_cycle_end:     cycleEnd.toISOString().split('T')[0],
        monthly_message_count: 0,
        monthly_mms_count:     0,
        monthly_voice_seconds: 0,
        updated_at:            now,
      })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'reset_billing', orgId)
  }

  else if (body.action === 'reset_sms_count') {
    const { error } = await supabase
      .from('organizations')
      .update({ monthly_message_count: 0, updated_at: now })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'reset_sms_count', orgId)
  }

  // ── Stripe actions ──────────────────────────────────────────────────────────

  else if (body.action === 'set_trial_end') {
    const { data: org } = await supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).single()
    if (!org?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 })
    const subs = await stripe.subscriptions.list({ customer: org.stripe_customer_id, limit: 1 })
    const sub = subs.data[0]
    if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
    const trialEnd = body.trial_end ? Math.floor(new Date(body.trial_end).getTime() / 1000) : 'now'
    await stripe.subscriptions.update(sub.id, { trial_end: trialEnd })
    await logAdminAction(profile.id, 'set_trial_end', orgId, { trial_end: body.trial_end })
  }

  else if (body.action === 'cancel_subscription') {
    const { data: org } = await supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).single()
    if (!org?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 })
    const subs = await stripe.subscriptions.list({ customer: org.stripe_customer_id, limit: 1 })
    const sub = subs.data[0]
    if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 400 })
    if (body.cancel_at_period_end) {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true })
    } else {
      await stripe.subscriptions.cancel(sub.id)
    }
    await logAdminAction(profile.id, 'cancel_subscription', orgId, { at_period_end: body.cancel_at_period_end })
  }

  else if (body.action === 'add_credit') {
    const { data: org } = await supabase.from('organizations').select('stripe_customer_id').eq('id', orgId).single()
    if (!org?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 })
    const cents = Math.round((body.credit_amount ?? 0) * -100) // negative = credit
    if (cents >= 0) return NextResponse.json({ error: 'Credit amount must be positive' }, { status: 400 })
    await stripe.customers.createBalanceTransaction(org.stripe_customer_id, {
      amount:   cents,
      currency: 'usd',
      description: body.credit_description ?? `Manual credit by admin`,
    })
    await logAdminAction(profile.id, 'add_credit', orgId, { amount: body.credit_amount, description: body.credit_description })
  }

  // ── Suspend / Unsuspend ─────────────────────────────────────────────────────

  else if (body.action === 'suspend') {
    const { error } = await supabase
      .from('organizations')
      .update({ suspended_at: now, suspension_reason: body.suspension_reason ?? null })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'suspend_org', orgId, { reason: body.suspension_reason })
  }

  else if (body.action === 'unsuspend') {
    const { error } = await supabase
      .from('organizations')
      .update({ suspended_at: null, suspension_reason: null })
      .eq('id', orgId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await logAdminAction(profile.id, 'unsuspend_org', orgId)
  }

  else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
