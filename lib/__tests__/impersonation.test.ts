/**
 * Impersonation write_mode gate tests
 *
 * Verifies that admin impersonation requires platform superadmin via
 * requireProfile() + requirePlatformSuperAdmin(profile.id).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => supabase,
}))
vi.mock('@/lib/auth/profile', () => ({
  requireProfile: vi.fn(),
}))
vi.mock('@/lib/auth/platform', () => ({
  requirePlatformSuperAdmin: vi.fn(),
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

import { POST } from '@/app/api/admin/impersonate/route'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

const mockedRequireProfile = vi.mocked(requireProfile)
const mockedRequirePlatformSuperAdmin = vi.mocked(requirePlatformSuperAdmin)

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

    mockedRequireProfile.mockResolvedValue({
      id: 'staff-uid',
      org_id: 'org-staff',
      role: 'dealer_admin',
      display_name: 'Staff User',
      created_at: new Date().toISOString(),
    })
    mockedRequirePlatformSuperAdmin.mockResolvedValue(null)

    // Default: org found
    supabase._table('organizations').single = vi.fn().mockResolvedValue({
      data: { id: 'org-target', name: 'Test Org' }, error: null,
    })
    // Audit log insert resolves silently
    supabase._table('admin_audit_log').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 when profile is not a platform superadmin', async () => {
    mockedRequirePlatformSuperAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    )

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: true }))

    expect(res.status).toBe(403)
    expect(mockedRequirePlatformSuperAdmin).toHaveBeenCalledWith('staff-uid')
  })

  it('returns 200 when profile is platform superadmin', async () => {
    mockedRequirePlatformSuperAdmin.mockResolvedValue(null)

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: true }))

    expect(res.status).toBe(200)
    const json = await res.json() as { write_mode: boolean }
    expect(json.write_mode).toBe(true)
  })

  it('enforces platform superadmin even when write_mode is false', async () => {
    mockedRequirePlatformSuperAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    )

    const res = await POST(makeReq({ org_id: 'org-target', write_mode: false }))

    expect(res.status).toBe(403)
    expect(mockedRequirePlatformSuperAdmin).toHaveBeenCalledWith('staff-uid')
  })
})
