import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeAuditLog } from '@/lib/audit/log'

const insertMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: insertMock,
    })),
  })),
}))

describe('writeAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertMock.mockResolvedValue({ error: null })
  })

  it('inserts the expected row shape (snake_case columns)', async () => {
    await writeAuditLog({
      orgId:      'org-1',
      actorId:    'actor-1',
      actorType:  'staff',
      action:     'impersonation_start',
      entityType: 'profile',
      entityId:   'ent-1',
      metadata:   { write_mode: true },
      ipAddress:  '203.0.113.1',
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(insertMock).toHaveBeenCalledWith({
      org_id:      'org-1',
      actor_id:    'actor-1',
      actor_type:  'staff',
      action:      'impersonation_start',
      entity_type: 'profile',
      entity_id:   'ent-1',
      metadata:    { write_mode: true },
      ip_address:  '203.0.113.1',
    })
  })

  it('never throws when Supabase returns an error', async () => {
    insertMock.mockResolvedValueOnce({ error: { message: 'db down' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      writeAuditLog({
        orgId:     null,
        actorId:   null,
        actorType: 'user',
        action:    'webhook_auth_failure',
        metadata:  { path: '/x', reason: 'test' },
      }),
    ).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('never throws when insert throws', async () => {
    insertMock.mockRejectedValueOnce(new Error('network'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      writeAuditLog({ orgId: null, actorId: null, actorType: 'user', action: 'x' }),
    ).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
