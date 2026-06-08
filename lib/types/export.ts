/**
 * Export pagination types and constants.
 *
 * Supports cursor-based pagination for large data exports to prevent timeouts.
 * - PAGE_SIZE = 10,000 records per page (Supabase row limit)
 * - MAX_PAGES = 100 pages (1M rows max per table)
 * - If org exceeds MAX_PAGES, export fails with clear error message
 */

export const EXPORT_PAGE_SIZE = 10000
export const EXPORT_MAX_PAGES = 100
export const EXPORT_MAX_RECORDS = EXPORT_PAGE_SIZE * EXPORT_MAX_PAGES // 1,000,000 rows max per table

export interface ExportPageResult {
  records: Record<string, unknown>[]
  hasMore: boolean
  pageNumber: number
  totalRecords: number
  nextCursor?: number // offset for next page
}

export interface ExportTableConfig {
  tableName: string
  columns: string
  orgIdFilter: 'org_id' | 'user_id' // Which column to scope by
  orgId: string
  maxRows?: number // Override default PAGE_SIZE
  sortBy?: string // Column to sort by (default: 'created_at')
  additionalFilters?: Array<{
    column: string
    operator: 'eq' | 'neq' | 'lt' | 'gt' | 'lte' | 'gte'
    value: string | number
  }>
}
