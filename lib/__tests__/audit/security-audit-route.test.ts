/**
 * GET /api/audit — security source (audit_log) auth and query wiring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient, makeTestProfile, type QueryBuilderStub } from '../helpers/testClient'

vi.mock('server-only', () => ({}))

const { supabase, ORG_ID, USER_ID } = makeTestClient()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}))

const { getProfileMock } = vi.hoisted(() => ({
  getProfileMock: vi.fn(),
}))

vi.mock('@/lib/auth/profile', () => ({
  getProfile: getProfileMock,
  normalizeOwnerRole: (p: { id: string; org_id: string; role: string }) => p,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}))

vi.mock('@/lib/auth/staffSession', () => ({
  getStaffSessionInfo: vi.fn(() => null),
}))

import { GET } from '@/app/api/audit/route'

function req(url: string) {
  return new NextRequest(url)
}

describe('GET /api/audit (security)', () => {
  beforeEach(() => {
    getProfileMock.mockReset()
    const audit = supabase._table('audit_log') as QueryBuilderStub
    vi.mocked(audit.maybeSingle).mockReset()
    audit.then = vi.fn((onF?: (v: unknown) => unknown) =>
      Promise.resolve({
        data:   [{ id: 'e1', actor_id: USER_ID, actor_type: 'user', action: 'data_export', entity_type: null, entity_id: null, metadata: {}, ip_address: '1.1.1.1', created_at: '2024-06-01T12:00:00Z' }],
        error:  null,
      }).then(onF as never)) as typeof audit.then
  })

  it('403 for dealer_rep with source=security', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_rep' }))
    const res = await GET(req(`http://localhost/api/audit?source=security&days=30`))
    expect(res.status).toBe(403)
  })

  it('403 for dealer_rep on default org audit path', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_rep' }))
    const res = await GET(req(`http://localhost/api/audit?days=30`))
    expect(res.status).toBe(403)
  })

  it('200 for dealer_admin with source=security', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    const res = await GET(req(`http://localhost/api/audit?source=security&days=30`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('security')
    expect(Array.isArray(body.entries)).toBe(true)
    expect(body.entries[0].action).toBe('data_export')
  })

  it('200 for dealer_manager with source=security', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_manager' }))
    const res = await GET(req(`http://localhost/api/audit?source=security&days=7`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('security')
  })

  it('400 for invalid action filter on security source', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    const res = await GET(req(`http://localhost/api/audit?source=security&action=not_a_real_action`))
    expect(res.status).toBe(400)
  })

  it('passes action filter to query for known actions', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    const audit = supabase._table('audit_log') as QueryBuilderStub
    const eqMock = vi.mocked(audit.eq)
    await GET(req(`http://localhost/api/audit?source=security&days=30&action=data_export`))
    const actionCalls = eqMock.mock.calls.filter(c => c[0] === 'action')
    expect(actionCalls.some(([, v]) => v === 'data_export')).toBe(true)
  })

  it('uses gte created_at window including clamped max 90 days', async () => {
    getProfileMock.mockResolvedValue(makeTestProfile({ id: USER_ID, org_id: ORG_ID, role: 'dealer_admin' }))
    const audit = supabase._table('audit_log') as QueryBuilderStub
    const gteMock = vi.mocked(audit.gte)
    gteMock.mockClear()
    await GET(req(`http://localhost/api/audit?source=security&days=999`))
    expect(gteMock).toHaveBeenCalled()
    const createdAtCalls = gteMock.mock.calls.filter(c => c[0] === 'created_at')
    const [, iso] = createdAtCalls[createdAtCalls.length - 1] ?? []
    expect(typeof iso).toBe('string')
    const start = new Date(String(iso))
    const now = new Date()
    const diffDays = Math.round((now.getTime() - start.getTime()) / (86400 * 1000))
    expect(diffDays).toBeGreaterThanOrEqual(87)
    expect(diffDays).toBeLessThanOrEqual(93)
  })
})
