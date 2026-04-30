/**
 * Integration connect/disconnect admin gate tests
 *
 * Verifies that every integration connect/disconnect route enforces
 * canManageUsers() — non-admins receive 403, admins are not blocked.
 *
 * Covered routes:
 *   GET  /api/social/connect/[platform]
 *   GET  /api/integrations/gmail/connect
 *   DELETE /api/integrations/gmail
 *   GET  /api/google/calendar-connect
 *   DELETE /api/google/calendar-disconnect
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeTestClient } from './helpers/testClient'

const { supabase } = makeTestClient()

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

// Must use a regular function (not arrow) so `new OAuth2()` works as a constructor
vi.mock('googleapis', () => ({
  google: {
    auth: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      OAuth2: vi.fn().mockImplementation(function(this: any) {
        this.generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?fake=1')
        this.setCredentials  = vi.fn()
      }),
    },
  },
}))

import { requireProfile } from '@/lib/auth/profile'
import { GET as socialConnect }       from '@/app/api/social/connect/[platform]/route'
import { GET as gmailConnect }        from '@/app/api/integrations/gmail/connect/route'
import { DELETE as gmailDisconnect }  from '@/app/api/integrations/gmail/route'
import { GET as calendarConnect }     from '@/app/api/google/calendar-connect/route'
import { DELETE as calendarDisconnect } from '@/app/api/google/calendar-disconnect/route'

const mockedRequireProfile = vi.mocked(requireProfile)

// Minimal profiles for the gate check — only `role` matters for canManageUsers()
const NON_ADMIN = { id: 'u1', org_id: 'org-1', role: 'dealer_staff', email: 'e@e.com', display_name: 'U', created_at: '' } as Awaited<ReturnType<typeof requireProfile>>
const ADMIN     = { id: 'u1', org_id: 'org-1', role: 'dealer_admin',  email: 'e@e.com', display_name: 'U', created_at: '' } as Awaited<ReturnType<typeof requireProfile>>

function makeReq(url: string, method = 'GET') {
  return new NextRequest(url, { method })
}

const socialParams = { params: Promise.resolve({ platform: 'facebook' }) }

describe('social connect — admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'uid-1' } }, error: null,
    })
  })

  it('returns 403 for non-admin', async () => {
    mockedRequireProfile.mockResolvedValue(NON_ADMIN)
    const res = await socialConnect(makeReq('http://localhost/api/social/connect/facebook'), socialParams)
    expect(res.status).toBe(403)
  })

  it('does not return 403 for dealer_admin', async () => {
    mockedRequireProfile.mockResolvedValue(ADMIN)
    const res = await socialConnect(makeReq('http://localhost/api/social/connect/facebook'), socialParams)
    expect(res.status).not.toBe(403)
  })
})

describe('gmail connect — admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'uid-1' } }, error: null,
    })
    supabase._table('org_settings').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 for non-admin', async () => {
    mockedRequireProfile.mockResolvedValue(NON_ADMIN)
    const res = await gmailConnect(makeReq('http://localhost/api/integrations/gmail/connect'))
    expect(res.status).toBe(403)
  })

  it('does not return 403 for dealer_admin', async () => {
    mockedRequireProfile.mockResolvedValue(ADMIN)
    const res = await gmailConnect(makeReq('http://localhost/api/integrations/gmail/connect'))
    expect(res.status).not.toBe(403)
  })
})

describe('gmail disconnect — admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase._table('org_settings').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 for non-admin', async () => {
    mockedRequireProfile.mockResolvedValue(NON_ADMIN)
    const res = await gmailDisconnect()
    expect(res.status).toBe(403)
  })

  it('does not return 403 for dealer_admin', async () => {
    mockedRequireProfile.mockResolvedValue(ADMIN)
    const res = await gmailDisconnect()
    expect(res.status).not.toBe(403)
  })
})

describe('calendar connect — admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'uid-1' } }, error: null,
    })
    supabase._table('org_google_tokens').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 for non-admin', async () => {
    mockedRequireProfile.mockResolvedValue(NON_ADMIN)
    const res = await calendarConnect()
    expect(res.status).toBe(403)
  })

  it('does not return 403 for dealer_admin', async () => {
    mockedRequireProfile.mockResolvedValue(ADMIN)
    const res = await calendarConnect()
    expect(res.status).not.toBe(403)
  })
})

describe('calendar disconnect — admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase._table('org_google_tokens').then = vi.fn().mockImplementation(
      (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    )
  })

  it('returns 403 for non-admin', async () => {
    mockedRequireProfile.mockResolvedValue(NON_ADMIN)
    const res = await calendarDisconnect()
    expect(res.status).toBe(403)
  })

  it('does not return 403 for dealer_admin', async () => {
    mockedRequireProfile.mockResolvedValue(ADMIN)
    const res = await calendarDisconnect()
    expect(res.status).not.toBe(403)
  })
})
