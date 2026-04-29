/**
 * Integration tests for the action === 'confirm' branch of app/api/pay/[token]/route.ts.
 *
 * Strategy:
 *   - Mock @/lib/supabase/service to return a makeTestClient() instance
 *   - Mock @/lib/rateLimit/upstash so paymentLimiter always allows
 *   - Mock global fetch to simulate Stripe PaymentIntent verify responses
 *   - Control RPC outcomes with supabase.rpc.mockResolvedValueOnce(...)
 *   - Assert no individual table writes occur in the confirm branch
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from '../helpers/testClient'

// Initialize the mock client before mocks are registered so the factory can close over it
const { supabase, ORG_ID } = makeTestClient()

// Mocks must be declared before the module under test is imported.
// Vitest hoists vi.mock() calls automatically.
vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  paymentLimiter: vi.fn().mockResolvedValue({ allowed: true }),
}))

// Import route handler AFTER mocks (Vitest hoists vi.mock so ordering is safe)
import { POST } from '@/app/api/pay/[token]/route'

// ── Shared test data ──────────────────────────────────────────────────────────

const FAKE_TOKEN_ROW = {
  id:               'token-uuid-001',
  amount:           350.00,
  status:           'pending',
  org_id:           ORG_ID,
  customer_id:      'customer-uuid-001',
  bhph_contract_id: 'contract-uuid-001',
}

const FAKE_ORG = {
  stripe_dealer_secret_key: 'sk_test_fake',
}

const FAKE_PI = {
  id:       'pi_test_001',
  status:   'succeeded',
  amount:   35000, // 350.00 in cents
  currency: 'usd',
  metadata: { bhph_payment_token: FAKE_TOKEN_ROW.id },
}

// ── Helper ────────────────────────────────────────────────────────────────────

function makeConfirmRequest(payment_intent_id = 'pi_test_001') {
  return new Request('http://localhost/api/pay/test-token', {
    method:  'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body:    JSON.stringify({ action: 'confirm', payment_intent_id }),
  }) as unknown as NextRequest
}

const routeParams = { params: Promise.resolve({ token: 'test-token' }) }

// ── Test suites ───────────────────────────────────────────────────────────────

describe('pay/[token] confirm branch — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Token lookup (confirm branch reads by token string)
    supabase._table('bhph_payment_tokens').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_TOKEN_ROW, error: null })

    // Org settings lookup (for Stripe secret key)
    supabase._table('org_settings').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_ORG, error: null })

    // Stripe verify fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve(FAKE_PI),
    }))

    // RPC returns success
    supabase.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
  })

  it('returns 200 { ok: true } on successful payment', async () => {
    const res = await POST(makeConfirmRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('calls finalize_bhph_payment rpc with correct params', async () => {
    await POST(makeConfirmRequest(), routeParams)
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'finalize_bhph_payment',
      expect.objectContaining({
        p_token_id:              FAKE_TOKEN_ROW.id,
        p_stripe_payment_intent: 'pi_test_001',
      })
    )
  })

  it('does NOT call bhph_payment_tokens.update directly', async () => {
    await POST(makeConfirmRequest(), routeParams)
    expect(supabase._table('bhph_payment_tokens').update).not.toHaveBeenCalled()
  })

  it('does NOT call activities.insert directly', async () => {
    await POST(makeConfirmRequest(), routeParams)
    expect(supabase._table('activities').insert).not.toHaveBeenCalled()
  })
})

describe('pay/[token] confirm branch — idempotency (already_processed)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    supabase._table('bhph_payment_tokens').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_TOKEN_ROW, error: null })

    supabase._table('org_settings').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_ORG, error: null })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve(FAKE_PI),
    }))

    // RPC reports token was already processed by the same PI
    supabase.rpc.mockResolvedValueOnce({ data: { already_processed: true }, error: null })
  })

  it('returns 200 { ok: true, already_processed: true } without error', async () => {
    const res = await POST(makeConfirmRequest(), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, already_processed: true })
  })
})

describe('pay/[token] confirm branch — RPC failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    supabase._table('bhph_payment_tokens').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_TOKEN_ROW, error: null })

    supabase._table('org_settings').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_ORG, error: null })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve(FAKE_PI),
    }))

    // RPC returns a DB error
    supabase.rpc.mockResolvedValueOnce({
      data:  null,
      error: { message: 'DB error', code: '42P01' },
    })
  })

  it('returns 500 { error: Could not finalize payment }', async () => {
    const res = await POST(makeConfirmRequest(), routeParams)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Could not finalize payment' })
  })
})

describe('pay/[token] confirm branch — conflict (different PI on paid token)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    supabase._table('bhph_payment_tokens').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_TOKEN_ROW, error: null })

    supabase._table('org_settings').maybeSingle
      .mockResolvedValueOnce({ data: FAKE_ORG, error: null })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve(FAKE_PI),
    }))

    // RPC reports a conflict (token paid by a different PI)
    supabase.rpc.mockResolvedValueOnce({ data: { conflict: true }, error: null })
  })

  it('returns 409 { error: Token already processed }', async () => {
    const res = await POST(makeConfirmRequest(), routeParams)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ error: 'Token already processed' })
  })
})
