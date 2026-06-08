/**
 * Unit tests for export pagination logic.
 *
 * Verifies that pagination correctly handles:
 * - Small tables (<PAGE_SIZE rows) in single query
 * - Large tables (>PAGE_SIZE rows) across multiple pages
 * - Oversized tables (>MAX_PAGES * PAGE_SIZE) with error
 */

import { describe, it, expect, vi } from 'vitest'
import { fetchTablePages } from '@/lib/export/pagination'
import { EXPORT_PAGE_SIZE, EXPORT_MAX_PAGES } from '@/lib/types/export'

function createMockSupabase() {
  const queryBuilder = {
    eq: vi.fn(() => queryBuilder),
    neq: vi.fn(() => queryBuilder),
    lt: vi.fn(() => queryBuilder),
    gt: vi.fn(() => queryBuilder),
    lte: vi.fn(() => queryBuilder),
    gte: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    range: vi.fn(async () => ({ data: [], error: null })),
  }

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => queryBuilder),
    })),
  }
}

describe('export pagination', () => {
  it('fetches small table in one query', async () => {
    const mockSupabase = createMockSupabase()
    const queryBuilder = (mockSupabase.from as any)().select()
    const mockRange = queryBuilder.range as any

    // Mock: 100 rows returned (less than PAGE_SIZE means end of data)
    mockRange.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, i) => ({ id: `row-${i}`, name: `Record ${i}` })),
      error: null,
    })

    const result = await fetchTablePages(mockSupabase as any, {
      tableName: 'activities',
      columns: 'id, name',
      orgIdFilter: 'user_id',
      orgId: 'test-org',
    })

    expect(result).toHaveLength(100)
    expect(result[0]).toHaveProperty('id', 'row-0')
    expect(result[99]).toHaveProperty('id', 'row-99')
    // range() should be called once with offset 0
    expect(mockRange).toHaveBeenCalledTimes(1)
    expect(mockRange).toHaveBeenCalledWith(0, EXPORT_PAGE_SIZE - 1)
  })

  it('fetches large table across multiple pages', async () => {
    const mockSupabase = createMockSupabase()
    const queryBuilder = (mockSupabase.from as any)().select()
    const mockRange = queryBuilder.range as any

    // Page 1: 10k rows (full page)
    mockRange.mockResolvedValueOnce({
      data: Array.from({ length: EXPORT_PAGE_SIZE }, (_, i) => ({
        id: `row-${i}`,
        name: `Record ${i}`,
      })),
      error: null,
    })

    // Page 2: 10k rows (full page)
    mockRange.mockResolvedValueOnce({
      data: Array.from({ length: EXPORT_PAGE_SIZE }, (_, i) => ({
        id: `row-${EXPORT_PAGE_SIZE + i}`,
        name: `Record ${EXPORT_PAGE_SIZE + i}`,
      })),
      error: null,
    })

    // Page 3: 5k rows (less than PAGE_SIZE indicates last page)
    mockRange.mockResolvedValueOnce({
      data: Array.from({ length: 5000 }, (_, i) => ({
        id: `row-${2 * EXPORT_PAGE_SIZE + i}`,
        name: `Record ${2 * EXPORT_PAGE_SIZE + i}`,
      })),
      error: null,
    })

    const result = await fetchTablePages(mockSupabase as any, {
      tableName: 'activities',
      columns: 'id, name',
      orgIdFilter: 'user_id',
      orgId: 'test-org',
    })

    expect(result).toHaveLength(25000)
    expect(result[0]).toHaveProperty('id', 'row-0')
    expect(result[EXPORT_PAGE_SIZE - 1]).toHaveProperty('id', `row-${EXPORT_PAGE_SIZE - 1}`)
    expect(result[EXPORT_PAGE_SIZE]).toHaveProperty('id', `row-${EXPORT_PAGE_SIZE}`)
    expect(result[2 * EXPORT_PAGE_SIZE]).toHaveProperty('id', `row-${2 * EXPORT_PAGE_SIZE}`)

    // range() should be called 3 times
    expect(mockRange).toHaveBeenCalledTimes(3)
  })

  it('throws error when table exceeds max pages', async () => {
    const mockSupabase = createMockSupabase()
    const queryBuilder = (mockSupabase.from as any)().select()
    const mockRange = queryBuilder.range as any

    // Mock: every page returns a full PAGE_SIZE (indicating more pages exist)
    mockRange.mockResolvedValue({
      data: Array.from({ length: EXPORT_PAGE_SIZE }, (_, i) => ({
        id: `row-${i}`,
        name: `Record ${i}`,
      })),
      error: null,
    })

    await expect(
      fetchTablePages(mockSupabase as any, {
        tableName: 'activities',
        columns: 'id, name',
        orgIdFilter: 'user_id',
        orgId: 'test-org',
      })
    ).rejects.toThrow('pagination_exceeded')

    // range() should be called MAX_PAGES times before throwing
    expect(mockRange).toHaveBeenCalledTimes(EXPORT_MAX_PAGES)
  })

  it('respects additional filters (e.g., neq for body)', async () => {
    const mockSupabase = createMockSupabase()
    const queryBuilder = (mockSupabase.from as any)().select()
    const mockNeq = queryBuilder.neq as any
    const mockRange = queryBuilder.range as any

    // Mock: 50 rows that pass the filter (less than PAGE_SIZE)
    mockRange.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, i) => ({
        id: `row-${i}`,
        body: `Activity text ${i}`,
      })),
      error: null,
    })

    const result = await fetchTablePages(mockSupabase as any, {
      tableName: 'activities',
      columns: 'id, body',
      orgIdFilter: 'user_id',
      orgId: 'test-org',
      additionalFilters: [{ column: 'body', operator: 'neq', value: '__sequence_sent__' }],
    })

    expect(result).toHaveLength(50)
    expect(mockNeq).toHaveBeenCalledWith('body', '__sequence_sent__')
  })

  it('handles error response from supabase', async () => {
    const mockSupabase = createMockSupabase()
    const queryBuilder = (mockSupabase.from as any)().select()
    const mockRange = queryBuilder.range as any

    mockRange.mockResolvedValueOnce({
      data: null,
      error: { message: 'Unauthorized' },
    })

    await expect(
      fetchTablePages(mockSupabase as any, {
        tableName: 'activities',
        columns: 'id, name',
        orgIdFilter: 'user_id',
        orgId: 'test-org',
      })
    ).rejects.toThrow('Failed to fetch activities')
  })

  it('applies org scoping correctly', async () => {
    const mockSupabase = createMockSupabase()
    const mockFrom = mockSupabase.from as any
    const queryBuilder = mockFrom().select()
    const mockEq = queryBuilder.eq as any
    const mockRange = queryBuilder.range as any

    mockRange.mockResolvedValueOnce({ data: [], error: null })

    await fetchTablePages(mockSupabase as any, {
      tableName: 'customers',
      columns: 'id, name',
      orgIdFilter: 'user_id',
      orgId: 'my-org-id',
    })

    expect(mockEq).toHaveBeenCalledWith('user_id', 'my-org-id')
  })
})
