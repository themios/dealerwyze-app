import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { makeTestClient, makeTestProfile } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase } = makeTestClient()

const { mockRequireProfile, mockExportLimiter } = vi.hoisted(() => ({
  mockRequireProfile: vi.fn(),
  mockExportLimiter: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: mockRequireProfile,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/rateLimit/upstash', () => ({
  orgLostLeadExportLimiter: mockExportLimiter,
}))

function makeReq(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' })
}

describe('GET /api/admin/performance/lost-leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireProfile.mockResolvedValue(makeTestProfile({ role: 'dealer_admin' }))
    mockExportLimiter.mockResolvedValue({ allowed: true })
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          id: 'audit-1',
          activity_id: 'act-1',
          customer_id: 'cust-1',
          assigned_rep_id: 'rep-1',
          last_human_actor_id: 'rep-1',
          archive_reason: 'manual',
          loss_reason: 'price',
          intent_tier: 'warm',
          intent_score: 72,
          lead_source: 'email',
          touches: 4,
          last_inbound_at: '2026-04-20T00:00:00.000Z',
          archived_at: '2026-05-01T00:00:00.000Z',
          reinstated_at: null,
          root_cause_json: null,
          root_cause_needs_review: false,
          customer: { id: 'cust-1', name: 'Jane Buyer', interested_in: '2020 Tahoe' },
          assigned_rep: { id: 'rep-1', display_name: 'Rep One' },
          last_actor: { id: 'rep-1', display_name: 'Rep One' },
        }],
        error: null,
      }),
    )
    supabase._table('profiles').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [{ id: 'rep-1', display_name: 'Rep One' }], error: null }),
    )
    supabase._table('ai_usage_log').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    )
  })

  it('caps date range server-side to 90 days', async () => {
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?from=2025-01-01&to=2026-05-01'))
    expect(res.status).toBe(200)
    expect(supabase._table('lost_lead_audit').gte).toHaveBeenCalled()
  })

  it('forces self-view filtering for reps', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep', id: 'rep-self' }))
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?assigned_rep_id=someone-else'))
    expect(res.status).toBe(200)
    expect(supabase._table('lost_lead_audit').eq).toHaveBeenCalledWith('assigned_rep_id', 'rep-self')
  })

  it('logs exports to ai_usage_log', async () => {
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?format=csv'))
    expect(res.status).toBe(200)
    expect(supabase._table('ai_usage_log').insert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'export_lost_leads' }),
    )
  })

  it('returns 429 when export rate limit is exceeded', async () => {
    mockExportLimiter.mockResolvedValueOnce({ allowed: false })
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?format=csv'))
    expect(res.status).toBe(429)
    expect(supabase._table('ai_usage_log').insert).not.toHaveBeenCalled()
  })

  it('hides root cause from rep self-view JSON', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep', id: 'rep-self' }))
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          id: 'audit-1',
          activity_id: 'act-1',
          customer_id: 'cust-1',
          assigned_rep_id: 'rep-self',
          last_human_actor_id: 'rep-self',
          archive_reason: 'manual',
          loss_reason: 'price',
          intent_tier: 'warm',
          intent_score: 72,
          lead_source: 'email',
          touches: 4,
          last_inbound_at: '2026-04-20T00:00:00.000Z',
          archived_at: '2026-05-01T00:00:00.000Z',
          reinstated_at: null,
          root_cause_json: { failure_mode: 'slow_followup', coaching_note: 'Do not leak' },
          root_cause_confidence: 0.88,
          root_cause_needs_review: false,
          customer: { id: 'cust-1', name: 'Jane Buyer', interested_in: '2020 Tahoe' },
          assigned_rep: { id: 'rep-self', display_name: 'Rep Self' },
          last_actor: { id: 'rep-self', display_name: 'Rep Self' },
        }],
        error: null,
      }),
    )
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads'))
    expect(res.status).toBe(200)
    const body = await res.json() as { rows: Array<{ root_cause: unknown; ai_root_cause_status: string }> }
    expect(body.rows[0].root_cause).toBeNull()
    expect(body.rows[0].ai_root_cause_status).toBe('not_shown')
  })

  it('omits root cause mode and confidence in CSV for reps', async () => {
    mockRequireProfile.mockResolvedValueOnce(makeTestProfile({ role: 'dealer_rep', id: 'rep-self' }))
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          id: 'audit-1',
          activity_id: 'act-1',
          customer_id: 'cust-1',
          assigned_rep_id: 'rep-self',
          last_human_actor_id: 'rep-self',
          archive_reason: 'manual',
          loss_reason: 'price',
          intent_tier: 'warm',
          intent_score: 72,
          lead_source: 'email',
          touches: 4,
          last_inbound_at: '2026-04-20T00:00:00.000Z',
          archived_at: '2026-05-01T00:00:00.000Z',
          reinstated_at: null,
          root_cause_json: { failure_mode: 'slow_followup', coaching_note: 'Secret' },
          root_cause_confidence: 0.88,
          root_cause_needs_review: false,
          customer: { id: 'cust-1', name: 'Jane Buyer', interested_in: '2020 Tahoe' },
          assigned_rep: { id: 'rep-self', display_name: 'Rep Self' },
          last_actor: { id: 'rep-self', display_name: 'Rep Self' },
        }],
        error: null,
      }),
    )
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?format=csv'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('root_cause_failure_mode')
    expect(text).not.toContain('slow_followup')
    expect(text).not.toContain('0.88')
    expect(text).not.toContain('Secret')
  })

  it('includes root cause mode and confidence in CSV for admins (not coaching note)', async () => {
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{
          id: 'audit-1',
          activity_id: 'act-1',
          customer_id: 'cust-1',
          assigned_rep_id: 'rep-1',
          last_human_actor_id: 'rep-1',
          archive_reason: 'manual',
          loss_reason: 'price',
          intent_tier: 'warm',
          intent_score: 72,
          lead_source: 'email',
          touches: 4,
          last_inbound_at: '2026-04-20T00:00:00.000Z',
          archived_at: '2026-05-01T00:00:00.000Z',
          reinstated_at: null,
          root_cause_json: { failure_mode: 'price_pushback', coaching_note: 'Sensitive coaching' },
          root_cause_confidence: 0.82,
          root_cause_needs_review: false,
          customer: { id: 'cust-1', name: 'Jane Buyer', interested_in: '2020 Tahoe' },
          assigned_rep: { id: 'rep-1', display_name: 'Rep One' },
          last_actor: { id: 'rep-1', display_name: 'Rep One' },
        }],
        error: null,
      }),
    )
    const { GET } = await import('@/app/api/admin/performance/lost-leads/route')
    const res = await GET(makeReq('https://dealerwyze.com/api/admin/performance/lost-leads?format=csv'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('price_pushback')
    expect(text).toContain('0.82')
    expect(text).not.toContain('Sensitive coaching')
  })
})
