/**
 * Impersonation write_mode gate tests
 *
 * Verifies that write_mode=true requires isPlatformSuperAdmin.
 * Non-superadmins must receive 403 regardless of canAccessAdminArea.
 * Superadmins must be allowed through.
 * write_mode=false must NOT trigger the superadmin check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))
vi.mock('@/lib/auth/platform', () => ({
  canAccessAdminArea:   vi.fn(),
  isPlatformSuperAdmin: vi.fn(),
}))
vi.mock('@/lib/auth/staffSession', () => ({
  buildStaffOrgCookie:  vi.fn().mockReturnValue({ name: 'dsw_staff_org', value: 'tok', path: '/', httpOnly: true }),
  clearStaffOrgCookie:  vi.fn().mockReturnValue({ name: 'dsw_staff_org', value: '', maxAge: 0 }),
  getStaffSessionInfo:  vi.fn().mockReturnValue(null),
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

import { canAccessAdminArea, isPlatformSuperAdmin } from '@/lib/auth/platform'
import { POST } from '@/app/api/admin/impersonate/route'

const mockedCanAccess   = vi.mocked(canAccessAdminArea)
const mockedSuperAdmin  = vi.mocked(isPlatformSuperAdmin)

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/admin/impersonate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('impersonation write_mode gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'staff-uid' } }, error: null,
    })
    mockedCanAccess.mockResolvedValue(true)

    // Default: org found
    supabase._table('organizations').single = vi.fn().mockResolvedValue({
      data: { id: 'org-target', name: 'Test Org' }, error: null,
    })
    // Audit log insert resolves silently
    supabase._table('admin_audit_log').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 when write_mode=true and user is NOT a superadmin', async () => {
    mockedSuperAdmin.mockResolvedValue(false)

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: true }))

    expect(res.status).toBe(403)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/superadmin/i)
  })

  it('returns 200 when write_mode=true and user IS a superadmin', async () => {
    mockedSuperAdmin.mockResolvedValue(true)

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: true }))

    expect(res.status).toBe(200)
    const json = await res.json() as { write_mode: boolean }
    expect(json.write_mode).toBe(true)
  })

  it('does NOT call isPlatformSuperAdmin when write_mode is false', async () => {
    mockedSuperAdmin.mockResolvedValue(false) // would 403 if incorrectly checked

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: false }))

    expect(res.status).toBe(200)
    expect(mockedSuperAdmin).not.toHaveBeenCalled()
  })
})
