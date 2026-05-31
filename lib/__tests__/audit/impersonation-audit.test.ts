/**
 * AUDIT-01: impersonation_start / impersonation_end → writeAuditLog
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from '../helpers/testClient'

const { supabase } = makeTestClient()

const writeAuditLog = vi.fn()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/audit/log', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLog(...args),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))
vi.mock('@/lib/auth/platform', () => ({
  canAccessAdminArea:   vi.fn().mockResolvedValue(true),
  isPlatformSuperAdmin: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/lib/auth/staffSession', () => ({
  buildStaffOrgCookie: vi.fn().mockReturnValue({ name: 'c', value: 'v', path: '/', httpOnly: true }),
  clearStaffOrgCookie: vi.fn().mockReturnValue({ name: 'c', value: '', maxAge: 0 }),
  getStaffSessionInfo: vi.fn().mockReturnValue({ orgId: 'org-target', writeMode: false }),
}))
vi.mock('@/lib/audit/orgAudit', () => ({
  logOrgAudit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/admin/verticalScope', () => ({
  getAdminVerticalScope: vi.fn().mockResolvedValue({ orgIds: ['org-target'] }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn() }),
}))

import { POST, DELETE } from '@/app/api/admin/impersonate/route'

describe('impersonation audit_log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'staff-uid' } }, error: null,
    })
    supabase._table('organizations').single = vi.fn().mockResolvedValue({
      data: { id: 'org-target', name: 'Test Org' }, error: null,
    })
    supabase._table('admin_audit_log').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('writes impersonation_start on POST', async () => {
    const req = new NextRequest('http://localhost/api/admin/impersonate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.2' },
      body: JSON.stringify({ org_id: 'org-target', write_mode: false }),
    })
    await POST(req)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId:     'org-target',
        actorId:   'staff-uid',
        actorType: 'staff',
        action:    'impersonation_start',
        metadata:  expect.objectContaining({ write_mode: false, org_name: 'Test Org' }),
        ipAddress: '198.51.100.2',
      }),
    )
  })

  it('writes impersonation_end on DELETE', async () => {
    await DELETE()

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId:     'org-target',
        actorId:   'staff-uid',
        actorType: 'staff',
        action:    'impersonation_end',
        metadata:  { write_mode: false },
      }),
    )
  })
})
