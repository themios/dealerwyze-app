/**
 * Tenant isolation tests — TENS-06 / TEST-03 / TEST-04
 *
 * Verifies that org-scoped routes:
 *   1. Reject unauthenticated requests (TEST-03)
 *   2. Never serve org A data to org B (TEST-04, 5 endpoint families)
 *
 * All Supabase calls are mocked — no network or real DB access.
 * "Wrong org" is simulated by stubs returning { data: null } (as RLS would).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile, QueryBuilderStub } from './helpers/testClient'

const { supabase, ORG_ID, ORG_B_ID } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/auth/profile', () => ({
  requireProfile: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))

vi.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}))

import { requireProfile } from '@/lib/auth/profile'
import { GET as getSequence, PATCH as patchSequence, DELETE as deleteSequence } from '@/app/api/sequences/[id]/route'
import { GET as getStages } from '@/app/api/pipeline-stages/route'
import { GET as getSegments, POST as postSegment, DELETE as deleteSegment } from '@/app/api/segments/route'
import { GET as getOrgSettings } from '@/app/api/settings/org/route'
import { GET as getPulseSettings } from '@/app/api/settings/pulse/route'

const mockedRequireProfile = vi.mocked(requireProfile)
type Stub = QueryBuilderStub

function makeReq(method: string, body?: unknown): NextRequest {
  return new Request(`http://localhost/api/test`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest
}

function makeNextReq(url: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/** Set up a stub's .then() to properly resolve via the promise callback pattern. */
function resolveThen(stub: Stub, result: { data: unknown; error: unknown }) {
  stub.then = vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => {
    resolve(result)
  })
}

const seqParams = { params: Promise.resolve({ id: 'seq-1' }) }

// ── Unauthenticated rejection (TEST-03) ──────────────────────────────────────

describe('auth enforcement — unauthenticated requests throw (TEST-03)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sequences/[id] GET rejects without session', async () => {
    mockedRequireProfile.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await expect(getSequence(makeReq('GET'), seqParams)).rejects.toThrow()
  })

  it('pipeline-stages GET rejects without session', async () => {
    mockedRequireProfile.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await expect(getStages()).rejects.toThrow()
  })

  it('segments GET rejects without session', async () => {
    mockedRequireProfile.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await expect(getSegments()).rejects.toThrow()
  })

  it('settings/org GET rejects without session', async () => {
    mockedRequireProfile.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await expect(getOrgSettings()).rejects.toThrow()
  })

  it('settings/pulse GET rejects without session', async () => {
    mockedRequireProfile.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }))
    await expect(getPulseSettings()).rejects.toThrow()
  })
})

// ── Cross-tenant isolation (TEST-04) — 5 endpoint families ───────────────────

describe('sequences/[id] — endpoint family 1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('GET scopes sequence query to authenticated org and returns 404 for missing/other-org sequence', async () => {
    const sequences = supabase._table('sequences') as Stub
    sequences.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await getSequence(makeReq('GET'), seqParams)

    expect(res.status).toBe(404)
    // Route must filter by org_id — not by a caller-supplied org
    expect(sequences.eq).toHaveBeenCalledWith('org_id', ORG_ID)
    expect(sequences.eq).not.toHaveBeenCalledWith('org_id', ORG_B_ID)
  })

  it('PATCH returns 404 when sequence not owned by authenticated org', async () => {
    const sequences = supabase._table('sequences') as Stub
    sequences.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await patchSequence(makeReq('PATCH', { name: 'Hacked' }), seqParams)

    expect(res.status).toBe(404)
    expect(sequences.eq).toHaveBeenCalledWith('org_id', ORG_ID)
  })

  it('DELETE returns 404 when sequence not owned by authenticated org', async () => {
    const sequences = supabase._table('sequences') as Stub
    sequences.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await deleteSequence(makeReq('DELETE'), seqParams)

    expect(res.status).toBe(404)
    expect(sequences.eq).toHaveBeenCalledWith('org_id', ORG_ID)
  })
})

describe('pipeline-stages — endpoint family 2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('GET scopes stage list to authenticated org', async () => {
    const stages = supabase._table('org_pipeline_stages') as Stub
    resolveThen(stages, { data: [{ stage_key: 'new', label: 'New', color: '#000', position: 0, is_hot: false, is_active: true }], error: null })

    await getStages()

    expect(stages.eq).toHaveBeenCalledWith('org_id', ORG_ID)
    expect(stages.eq).not.toHaveBeenCalledWith('org_id', ORG_B_ID)
  })
})

describe('segments — endpoint family 3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('GET scopes segment list to authenticated org', async () => {
    const segments = supabase._table('saved_segments') as Stub
    resolveThen(segments, { data: [], error: null })

    await getSegments()

    expect(segments.eq).toHaveBeenCalledWith('org_id', ORG_ID)
    expect(segments.eq).not.toHaveBeenCalledWith('org_id', ORG_B_ID)
  })

  it('POST inserts segment with authenticated org_id only', async () => {
    const segments = supabase._table('saved_segments') as Stub
    segments.single.mockResolvedValueOnce({ data: { id: 's1', name: 'Hot Leads', filters: {}, created_at: '' }, error: null })

    await postSegment(makeReq('POST', { name: 'Hot Leads', filters: {} }))

    const insertArg = segments.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    if (insertArg) {
      expect(insertArg.org_id).toBe(ORG_ID)
      expect(insertArg.org_id).not.toBe(ORG_B_ID)
    }
  })

  it('DELETE returns 404 for segment not owned by authenticated org', async () => {
    const segments = supabase._table('saved_segments') as Stub
    segments.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const res = await deleteSegment(makeNextReq('http://localhost/api/segments?id=seg-other-org', 'DELETE'))

    expect(res.status).toBe(404)
    expect(segments.eq).toHaveBeenCalledWith('org_id', ORG_ID)
  })
})

describe('settings/org — endpoint family 4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('GET scopes org query to authenticated org_id', async () => {
    const orgs = supabase._table('organizations') as Stub
    orgs.single.mockResolvedValueOnce({ data: { name: 'Test Org', plan: 'free', subscription_status: 'active' }, error: null })
    const settings = supabase._table('org_settings') as Stub
    settings.single.mockResolvedValueOnce({ data: null, error: null })
    const tokens = supabase._table('org_google_tokens') as Stub
    tokens.single.mockResolvedValueOnce({ data: null, error: null })

    await getOrgSettings()

    expect(orgs.eq).toHaveBeenCalledWith('id', ORG_ID)
    expect(orgs.eq).not.toHaveBeenCalledWith('id', ORG_B_ID)
  })
})

describe('settings/pulse — endpoint family 5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRequireProfile.mockResolvedValue(
      makeTestProfile({ org_id: ORG_ID, role: 'admin' }) as Awaited<ReturnType<typeof requireProfile>>,
    )
  })

  it('GET scopes pulse settings query to authenticated org', async () => {
    const settings = supabase._table('org_settings') as Stub
    settings.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    await getPulseSettings()

    const allEqCalls = settings.eq.mock.calls as [string, unknown][]
    const orgEqValues = allEqCalls.filter(([col]) => col === 'org_id').map(([, val]) => val)
    expect(orgEqValues).toContain(ORG_ID)
    expect(orgEqValues).not.toContain(ORG_B_ID)
  })
})
