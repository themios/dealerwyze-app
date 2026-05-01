/**
 * Test client helper — provides a mock Supabase client scoped to a fake test org.
 * Does NOT connect to any real database. All methods return vi.fn() stubs.
 *
 * Usage:
 *   const { supabase, ORG_ID } = makeTestClient()
 *   supabase.from('vehicles').select.mockResolvedValueOnce({ data: [...], error: null })
 */

import { vi } from 'vitest'

export const TEST_ORG_ID   = 'test-org-00000000-0000-0000-0000-000000000001'
export const TEST_ORG_B_ID = 'test-org-00000000-0000-0000-0000-000000000002'
export const TEST_USER_ID  = 'test-user-0000-0000-0000-000000000001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<any>>

export interface QueryBuilderStub {
  select:      MockFn
  insert:      MockFn
  update:      MockFn
  upsert:      MockFn
  delete:      MockFn
  eq:          MockFn
  neq:         MockFn
  in:          MockFn
  is:          MockFn
  not:         MockFn
  lt:          MockFn
  lte:         MockFn
  gt:          MockFn
  gte:         MockFn
  ilike:       MockFn
  contains:    MockFn
  or:          MockFn
  filter:      MockFn
  range:       MockFn
  order:       MockFn
  limit:       MockFn
  single:      MockFn
  maybeSingle: MockFn
  then:        MockFn
  _chain:      () => QueryBuilderStub
}

/** Minimal chainable Supabase query builder stub. */
function makeQueryBuilder(defaultResult = { data: [], error: null }): QueryBuilderStub {
  const stub = {} as QueryBuilderStub
  const chain = () => stub
  const terminal = vi.fn((onFulfilled?: (value: typeof defaultResult) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(defaultResult).then(onFulfilled, onRejected)
  )

  stub.select       = vi.fn().mockReturnValue(stub)
  stub.insert       = vi.fn().mockReturnValue(stub)
  stub.update       = vi.fn().mockReturnValue(stub)
  stub.upsert       = vi.fn().mockReturnValue(stub)
  stub.delete       = vi.fn().mockReturnValue(stub)
  stub.eq           = vi.fn().mockReturnValue(stub)
  stub.neq          = vi.fn().mockReturnValue(stub)
  stub.in           = vi.fn().mockReturnValue(stub)
  stub.is           = vi.fn().mockReturnValue(stub)
  stub.not          = vi.fn().mockReturnValue(stub)
  stub.lt           = vi.fn().mockReturnValue(stub)
  stub.lte          = vi.fn().mockReturnValue(stub)
  stub.gt           = vi.fn().mockReturnValue(stub)
  stub.gte          = vi.fn().mockReturnValue(stub)
  stub.ilike        = vi.fn().mockReturnValue(stub)
  stub.contains     = vi.fn().mockReturnValue(stub)
  stub.or           = vi.fn().mockReturnValue(stub)
  stub.filter       = vi.fn().mockReturnValue(stub)
  stub.range        = vi.fn().mockReturnValue(stub)
  stub.order        = vi.fn().mockReturnValue(stub)
  stub.limit        = vi.fn().mockReturnValue(stub)
  stub.single       = vi.fn().mockResolvedValue(defaultResult)
  stub.maybeSingle  = vi.fn().mockResolvedValue(defaultResult)
  stub.then         = terminal
  stub._chain       = chain

  return stub
}

export interface TestClient {
  supabase: ReturnType<typeof makeTestClient>['supabase']
  ORG_ID: string
  ORG_B_ID: string
  USER_ID: string
}

/**
 * Creates a mock Supabase client scoped to TEST_ORG_ID.
 * The `from()` method returns a chainable query builder stub.
 * Override individual method responses with `.mockResolvedValueOnce(...)`.
 */
export function makeTestClient() {
  const fromMap: Record<string, ReturnType<typeof makeQueryBuilder>> = {}

  const supabase = {
    from: vi.fn((table: string) => {
      if (!fromMap[table]) fromMap[table] = makeQueryBuilder()
      return fromMap[table]
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://test.example/signed' }, error: null }),
        upload:          vi.fn().mockResolvedValue({ data: {}, error: null }),
        remove:          vi.fn().mockResolvedValue({ data: {}, error: null }),
      }),
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: TEST_USER_ID } }, error: null }),
    },
    /** Access the underlying table stub to set mock responses */
    _table: (table: string) => {
      if (!fromMap[table]) fromMap[table] = makeQueryBuilder()
      return fromMap[table]
    },
  }

  return {
    supabase,
    ORG_ID:   TEST_ORG_ID,
    ORG_B_ID: TEST_ORG_B_ID,
    USER_ID:  TEST_USER_ID,
  }
}

/**
 * Mock profile returned by requireProfile() in tests.
 * Scoped to TEST_ORG_ID by default.
 */
export function makeTestProfile(overrides: Partial<{ org_id: string; id: string; role: string }> = {}) {
  return {
    id:           overrides.id      ?? TEST_USER_ID,
    org_id:       overrides.org_id  ?? TEST_ORG_ID,
    role:         overrides.role    ?? 'admin',
    email:        'test@example.com',
    display_name: 'Test User',
    created_at:   '2024-01-01T00:00:00Z',
  }
}
