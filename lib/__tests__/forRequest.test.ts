import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cookiesMock,
  createClientMock,
  createServiceClientMock,
  createScopedImpersonationClientMock,
  getStaffSessionInfoMock,
} = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createClientMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  createScopedImpersonationClientMock: vi.fn(),
  getStaffSessionInfoMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}))

vi.mock('@/lib/auth/staffSession', () => ({
  getStaffSessionInfo: getStaffSessionInfoMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: createServiceClientMock,
}))

vi.mock('@/lib/supabase/impersonation', () => ({
  createScopedImpersonationClient: createScopedImpersonationClientMock,
}))

import { createClientForRequest } from '@/lib/supabase/forRequest'

describe('createClientForRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookiesMock.mockResolvedValue({ cookieJar: true })
    createClientMock.mockReturnValue({ kind: 'rls' })
    createServiceClientMock.mockReturnValue({ kind: 'service' })
    createScopedImpersonationClientMock.mockReturnValue({ kind: 'scoped' })
  })

  it('returns the standard RLS client when no staff session is active', async () => {
    getStaffSessionInfoMock.mockReturnValue(null)

    const client = await createClientForRequest()

    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(createScopedImpersonationClientMock).not.toHaveBeenCalled()
    expect(client).toEqual({ kind: 'rls' })
  })

  it('returns an org-scoped impersonation client for read-only staff sessions', async () => {
    getStaffSessionInfoMock.mockReturnValue({ orgId: 'org-readonly', writeMode: false })

    const client = await createClientForRequest()

    expect(createScopedImpersonationClientMock).toHaveBeenCalledWith('org-readonly')
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(client).toEqual({ kind: 'scoped' })
  })

  it('returns org-scoped impersonation client for write-enabled staff sessions (no service role)', async () => {
    getStaffSessionInfoMock.mockReturnValue({ orgId: 'org-admin', writeMode: true })

    const client = await createClientForRequest()

    expect(createScopedImpersonationClientMock).toHaveBeenCalledWith('org-admin')
    expect(createServiceClientMock).not.toHaveBeenCalled()
    expect(client).toEqual({ kind: 'scoped' })
  })
})
