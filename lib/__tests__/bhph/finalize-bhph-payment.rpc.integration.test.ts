import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Integration-level verification for the Postgres RPC: `finalize_bhph_payment`.
 *
 * Why this file exists:
 * - The route tests in `lib/__tests__/bhph/pay-confirm.test.ts` mock `supabase.rpc(...)`,
 *   so they cannot prove PAY-01/02/03/05 (atomicity + idempotency) against a real DB.
 *
 * This suite hits a real Supabase instance using service-role credentials.
 * It is expected to be skipped in CI unless env vars are provided.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const runIntegration = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY)

type RpcResult = { ok?: true } | { already_processed?: true } | { conflict?: true }

function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message)
  return value
}

function makeSupabase(): SupabaseClient {
  return createClient(must(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL missing'), must(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY missing'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// Stable fixture IDs so cleanup is safe and deterministic.
const FIX_ORG_ID      = 'ffffffff-ffff-ffff-ffff-000000000107'
const FIX_CUSTOMER_ID = 'ffffffff-ffff-ffff-ffff-000000000108'
const FIX_CONTRACT_ID = 'ffffffff-ffff-ffff-ffff-000000000109'
const FIX_TOKEN_ID    = 'ffffffff-ffff-ffff-ffff-00000000010a'
const FIX_VEHICLE_ID  = 'ffffffff-ffff-ffff-ffff-00000000010b'

const PAID_AT = '2026-05-01T00:00:00.000Z'

const suite = runIntegration ? describe : describe.skip

suite('RPC integration: finalize_bhph_payment', { timeout: 15_000 }, () => {
  const supabase = runIntegration ? makeSupabase() : (null as unknown as SupabaseClient)

  async function cleanup() {
    // Most-specific → least-specific to satisfy FK constraints.
    await supabase.from('activities').delete().eq('customer_id', FIX_CUSTOMER_ID)
    await supabase.from('bhph_payment_tokens').delete().eq('id', FIX_TOKEN_ID)
    await supabase.from('bhph_payments').delete().eq('id', FIX_CONTRACT_ID)
    await supabase.from('vehicles').delete().eq('id', FIX_VEHICLE_ID)
    await supabase.from('customers').delete().eq('id', FIX_CUSTOMER_ID)
  }

  beforeEach(async () => {
    await cleanup()

    // Minimal customer row (tenant context is user_id = org_id in this schema).
    const { error: custErr } = await supabase.from('customers').insert({
      id: FIX_CUSTOMER_ID,
      user_id: FIX_ORG_ID,
      name: 'Integration Test Buyer',
      primary_phone: '',
      email: null,
      archived: false,
      created_at: PAID_AT,
    })
    if (custErr) throw new Error(`fixture insert customers failed: ${custErr.message}`)

    const { error: vehicleErr } = await supabase.from('vehicles').insert({
      id: FIX_VEHICLE_ID,
      user_id: FIX_ORG_ID,
      stock_no: 'IT-107',
      vin: null,
      year: 2020,
      make: 'Test',
      model: 'Vehicle',
      trim: null,
      color: null,
      mileage: null,
      price: null,
      status: 'available',
      notes: null,
      photo_url: null,
      created_at: PAID_AT,
    })
    if (vehicleErr) throw new Error(`fixture insert vehicles failed: ${vehicleErr.message}`)

    const { error: contractErr } = await supabase.from('bhph_payments').insert({
      id: FIX_CONTRACT_ID,
      user_id: FIX_ORG_ID,
      customer_id: FIX_CUSTOMER_ID,
      vehicle_id: FIX_VEHICLE_ID,
      monthly_payment: 250,
      payment_day_of_month: 1,
      next_due_date: '2026-05-01',
      total_paid: 100,
      payment_frequency: 'monthly',
      last_reminder_type: 'sms',
      status: 'active',
      created_at: PAID_AT,
    })
    if (contractErr) throw new Error(`fixture insert bhph_payments failed: ${contractErr.message}`)

    const { error: tokenErr } = await supabase.from('bhph_payment_tokens').insert({
      id: FIX_TOKEN_ID,
      token: 'it-finalize-bhph-payment-107',
      amount: 50,
      status: 'pending',
      org_id: FIX_ORG_ID,
      customer_id: FIX_CUSTOMER_ID,
      bhph_contract_id: FIX_CONTRACT_ID,
      expires_at: '2099-01-01T00:00:00.000Z',
      created_at: PAID_AT,
    })
    if (tokenErr) throw new Error(`fixture insert bhph_payment_tokens failed: ${tokenErr.message}`)
  })

  afterEach(async () => {
    await cleanup()
  })

  it('Happy path: completes atomically (token paid, activity inserted, contract advanced)', async () => {
    const { data, error } = await supabase.rpc('finalize_bhph_payment', {
      p_token_id: FIX_TOKEN_ID,
      p_stripe_payment_intent: 'pi_integration_001',
      p_paid_at: PAID_AT,
    })
    if (error) throw new Error(`rpc error: ${error.message}`)
    expect(data as RpcResult).toEqual({ ok: true })

    const { data: tokenRow, error: tokenReadErr } = await supabase
      .from('bhph_payment_tokens')
      .select('status, stripe_payment_intent_id')
      .eq('id', FIX_TOKEN_ID)
      .maybeSingle()
    if (tokenReadErr) throw new Error(`token read error: ${tokenReadErr.message}`)
    expect(tokenRow?.status).toBe('paid')
    expect(tokenRow?.stripe_payment_intent_id).toBe('pi_integration_001')

    const { data: acts, error: actsErr } = await supabase
      .from('activities')
      .select('user_id, customer_id, body, completed_at')
      .eq('customer_id', FIX_CUSTOMER_ID)
      .order('created_at', { ascending: false })
    if (actsErr) throw new Error(`activities read error: ${actsErr.message}`)
    expect((acts ?? []).length).toBe(1)
    expect(acts?.[0]?.user_id).toBe(FIX_ORG_ID)
    expect(acts?.[0]?.customer_id).toBe(FIX_CUSTOMER_ID)
    expect(String(acts?.[0]?.body ?? '')).toContain('BHPH payment of $50')
    expect(acts?.[0]?.completed_at).toBe(PAID_AT)

    const { data: contractRow, error: contractReadErr } = await supabase
      .from('bhph_payments')
      .select('total_paid, next_due_date, last_reminder_type')
      .eq('id', FIX_CONTRACT_ID)
      .maybeSingle()
    if (contractReadErr) throw new Error(`contract read error: ${contractReadErr.message}`)
    expect(contractRow?.total_paid).toBe(150)
    // payment_frequency !== weekly/biweekly ⇒ +1 month
    expect(contractRow?.next_due_date).toBe('2026-06-01')
    expect(contractRow?.last_reminder_type).toBeNull()
  })

  it('Idempotency: second call with same PI returns already_processed and does not double-write', async () => {
    const first = await supabase.rpc('finalize_bhph_payment', {
      p_token_id: FIX_TOKEN_ID,
      p_stripe_payment_intent: 'pi_integration_002',
      p_paid_at: PAID_AT,
    })
    if (first.error) throw new Error(`rpc error (first): ${first.error.message}`)
    expect(first.data as RpcResult).toEqual({ ok: true })

    const { data: contractAfterFirst } = await supabase
      .from('bhph_payments')
      .select('total_paid')
      .eq('id', FIX_CONTRACT_ID)
      .maybeSingle()
    const paidAfterFirst = contractAfterFirst?.total_paid

    const second = await supabase.rpc('finalize_bhph_payment', {
      p_token_id: FIX_TOKEN_ID,
      p_stripe_payment_intent: 'pi_integration_002',
      p_paid_at: PAID_AT,
    })
    if (second.error) throw new Error(`rpc error (second): ${second.error.message}`)
    expect(second.data as RpcResult).toEqual({ already_processed: true })

    const { data: contractAfterSecond, error: contractSecondErr } = await supabase
      .from('bhph_payments')
      .select('total_paid')
      .eq('id', FIX_CONTRACT_ID)
      .maybeSingle()
    if (contractSecondErr) throw new Error(`contract read error: ${contractSecondErr.message}`)
    expect(contractAfterSecond?.total_paid).toBe(paidAfterFirst)

    const { count: actCount, error: actCountErr } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', FIX_CUSTOMER_ID)
    if (actCountErr) throw new Error(`activity count error: ${actCountErr.message}`)
    expect(actCount).toBe(1)
  })

  it('Conflict: already-paid token with different PI returns conflict and does not write', async () => {
    const { error: markPaidErr } = await supabase
      .from('bhph_payment_tokens')
      .update({ status: 'paid', stripe_payment_intent_id: 'pi_original', paid_at: PAID_AT })
      .eq('id', FIX_TOKEN_ID)
    if (markPaidErr) throw new Error(`mark token paid failed: ${markPaidErr.message}`)

    const { data: contractBefore, error: contractBeforeErr } = await supabase
      .from('bhph_payments')
      .select('total_paid')
      .eq('id', FIX_CONTRACT_ID)
      .maybeSingle()
    if (contractBeforeErr) throw new Error(`contract read error: ${contractBeforeErr.message}`)

    const { data, error } = await supabase.rpc('finalize_bhph_payment', {
      p_token_id: FIX_TOKEN_ID,
      p_stripe_payment_intent: 'pi_different',
      p_paid_at: PAID_AT,
    })
    if (error) throw new Error(`rpc error: ${error.message}`)
    expect(data as RpcResult).toEqual({ conflict: true })

    const { count: actCount, error: actCountErr } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', FIX_CUSTOMER_ID)
    if (actCountErr) throw new Error(`activity count error: ${actCountErr.message}`)
    expect(actCount).toBe(0)

    const { data: contractAfter, error: contractAfterErr } = await supabase
      .from('bhph_payments')
      .select('total_paid')
      .eq('id', FIX_CONTRACT_ID)
      .maybeSingle()
    if (contractAfterErr) throw new Error(`contract read error: ${contractAfterErr.message}`)
    expect(contractAfter?.total_paid).toBe(contractBefore?.total_paid)
  })
})

