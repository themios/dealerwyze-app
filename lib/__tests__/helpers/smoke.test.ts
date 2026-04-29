/**
 * Smoke test — verifies makeTestClient() works and the test runner resolves
 * the @/ alias. If this fails, the test infrastructure is broken.
 */

import { describe, it, expect, vi } from 'vitest'
import { makeTestClient, makeTestProfile, TEST_ORG_ID, TEST_ORG_B_ID } from './testClient'

describe('makeTestClient', () => {
  it('creates a scoped client with correct org IDs', () => {
    const { supabase, ORG_ID, ORG_B_ID } = makeTestClient()
    expect(ORG_ID).toBe(TEST_ORG_ID)
    expect(ORG_B_ID).toBe(TEST_ORG_B_ID)
    expect(typeof supabase.from).toBe('function')
  })

  it('from() returns a chainable query builder', () => {
    const { supabase } = makeTestClient()
    const builder = supabase.from('vehicles')
    expect(typeof builder.select).toBe('function')
    expect(typeof builder.eq).toBe('function')
    expect(typeof builder.limit).toBe('function')
  })

  it('allows mocking individual table responses', async () => {
    const { supabase, ORG_ID } = makeTestClient()
    const fakeVehicle = { id: 'v1', user_id: ORG_ID, make: 'Toyota' }
    supabase._table('vehicles').single.mockResolvedValueOnce({ data: fakeVehicle, error: null })

    const result = await supabase.from('vehicles').select('*').eq('user_id', ORG_ID).single()
    expect(result.data).toEqual(fakeVehicle)
    expect(result.error).toBeNull()
  })

  it('rpc() returns stubbed null by default', async () => {
    const { supabase } = makeTestClient()
    const result = await supabase.rpc('confirm_bhph_payment', {})
    expect(result.error).toBeNull()
  })

  it('storage.from().createSignedUrl returns a test URL', async () => {
    const { supabase } = makeTestClient()
    const result = await supabase.storage.from('vehicle-docs').createSignedUrl('org/file.pdf', 3600)
    expect(result.data?.signedUrl).toContain('https://test.example')
  })
})

describe('makeTestProfile', () => {
  it('returns a profile scoped to TEST_ORG_ID by default', () => {
    const profile = makeTestProfile()
    expect(profile.org_id).toBe(TEST_ORG_ID)
    expect(profile.role).toBe('admin')
  })

  it('accepts overrides', () => {
    const profile = makeTestProfile({ org_id: TEST_ORG_B_ID, role: 'staff' })
    expect(profile.org_id).toBe(TEST_ORG_B_ID)
    expect(profile.role).toBe('staff')
  })
})
