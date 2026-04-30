import { beforeEach, describe, expect, it, vi } from 'vitest'

const eqMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: fromMock,
  }),
}))

import { createScopedImpersonationClient } from '@/lib/supabase/impersonation'

describe('createScopedImpersonationClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eqMock.mockReturnValue({ scoped: true })
    fromMock.mockReturnValue({ eq: eqMock })
  })

  it('pre-scopes allowlisted org tables', () => {
    const client = createScopedImpersonationClient('org-123')
    const builder = client.from('vehicles')

    expect(fromMock).toHaveBeenCalledWith('vehicles')
    expect(eqMock).toHaveBeenCalledWith('user_id', 'org-123')
    expect(builder).toEqual({ scoped: true })
  })

  it('allows approved global read tables without org scoping', () => {
    const rawBuilder = { order: vi.fn() }
    fromMock.mockReturnValueOnce(rawBuilder)

    const client = createScopedImpersonationClient('org-123')
    const builder = client.from('video_templates')

    expect(fromMock).toHaveBeenCalledWith('video_templates')
    expect(eqMock).not.toHaveBeenCalled()
    expect(builder).toBe(rawBuilder)
  })

  it('rejects unreviewed tables', () => {
    const client = createScopedImpersonationClient('org-123')

    expect(() => client.from('customer_vehicles')).toThrow(
      'Read-only impersonation attempted to access unscoped table "customer_vehicles"',
    )
  })
})
