import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeTestClient } from './helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase, ORG_ID } = makeTestClient()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

const mockGroqCreate = vi.fn()
vi.mock('groq-sdk', () => ({
  default: class Groq {
    constructor() {}
    chat = { completions: { create: mockGroqCreate } }
  },
}))

describe('runRootCauseBatchForOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GROQ_API_KEY = 'test-key'

    // Budget count
    supabase._table('lost_lead_audit').select.mockReturnValue(supabase._table('lost_lead_audit'))
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
    )
  })

  it('skips leads with < 3 activities', async () => {
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementationOnce(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 0, error: null }),
    ).mockImplementationOnce(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [{ id: 'audit-1', org_id: ORG_ID, customer_id: 'cust-1', archived_at: new Date().toISOString() }],
        error: null,
      }),
    )

    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [
          { created_at: '2026-05-01T00:00:00.000Z', direction: 'inbound', type: 'sms', body: 'hi', created_by: null },
          { created_at: '2026-05-01T01:00:00.000Z', direction: 'outbound', type: 'sms', body: 'hello', created_by: 'rep-1' },
        ],
        error: null,
      }),
    )

    const { runRootCauseBatchForOrg } = await import('@/lib/intelligence/rootCause')
    const result = await runRootCauseBatchForOrg({ orgId: ORG_ID, supabase })
    expect(result.skippedLowActivity).toBe(1)
    expect(mockGroqCreate).not.toHaveBeenCalled()
  })

  it('sets root_cause_needs_review when confidence < 0.6', async () => {
    supabase._table('lost_lead_audit').then = vi.fn()
      // budget count
      .mockImplementationOnce((resolve: (value: unknown) => unknown) => resolve({ data: [], count: 0, error: null }))
      // candidates
      .mockImplementationOnce((resolve: (value: unknown) => unknown) => resolve({
        data: [{ id: 'audit-1', org_id: ORG_ID, customer_id: 'cust-1', archived_at: new Date().toISOString() }],
        error: null,
      }))
      // update
      .mockImplementationOnce((resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }))

    supabase._table('activities').then = vi.fn().mockImplementation(
      (resolve: (value: unknown) => unknown) => resolve({
        data: [
          { created_at: '2026-05-01T00:00:00.000Z', direction: 'inbound', type: 'sms', body: 'price?', created_by: null },
          { created_at: '2026-05-01T01:00:00.000Z', direction: 'outbound', type: 'sms', body: 'ok', created_by: 'rep-1' },
          { created_at: '2026-05-01T02:00:00.000Z', direction: 'inbound', type: 'sms', body: 'any update', created_by: null },
        ],
        error: null,
      }),
    )

    mockGroqCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        failure_mode: 'price_objection_missed',
        inflection_activity_index: 1,
        rep_controllable: true,
        coaching_note: 'Customer asked about price; follow-up never addressed it.',
        confidence: 0.5,
      }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    })

    supabase._table('lost_lead_audit').update.mockReturnValue(supabase._table('lost_lead_audit'))

    const { runRootCauseBatchForOrg } = await import('@/lib/intelligence/rootCause')
    const result = await runRootCauseBatchForOrg({ orgId: ORG_ID, supabase })
    expect(result.written).toBe(1)
    expect(supabase._table('lost_lead_audit').update).toHaveBeenCalledWith(
      expect.objectContaining({ root_cause_needs_review: true }),
    )
  })

  it('enforces weekly budget cap at 50', async () => {
    supabase._table('lost_lead_audit').then = vi.fn().mockImplementationOnce(
      (resolve: (value: unknown) => unknown) => resolve({ data: [], count: 50, error: null }),
    )

    const { runRootCauseBatchForOrg } = await import('@/lib/intelligence/rootCause')
    const result = await runRootCauseBatchForOrg({ orgId: ORG_ID, supabase })
    expect(result.attempted).toBe(0)
    expect(mockGroqCreate).not.toHaveBeenCalled()
  })
})

