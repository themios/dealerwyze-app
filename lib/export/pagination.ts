/**
 * Export pagination helper.
 *
 * Fetches large tables in 10k-row pages to prevent timeouts.
 * Used by data export endpoint to handle org datasets with 50k+ rows per table.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  EXPORT_PAGE_SIZE,
  EXPORT_MAX_PAGES,
  ExportTableConfig,
  ExportPageResult,
} from '@/lib/types/export'

/**
 * Fetch all records from a table across multiple pages.
 * Returns all records collected; throws error if pagination limit exceeded.
 *
 * @param supabase - Supabase client (service or authenticated)
 * @param config - Table configuration with org scoping
 * @returns Array of all records collected across pages
 * @throws Error with 'pagination_exceeded' if org has >1M records in table
 */
export async function fetchTablePages(
  supabase: SupabaseClient,
  config: ExportTableConfig
): Promise<Record<string, unknown>[]> {
  const {
    tableName,
    columns,
    orgIdFilter,
    orgId,
    maxRows = EXPORT_PAGE_SIZE,
    sortBy = 'created_at',
    additionalFilters = [],
  } = config

  let allRecords: Record<string, unknown>[] = []
  let pageNumber = 0
  let hasMore = true

  while (hasMore && pageNumber < EXPORT_MAX_PAGES) {
    const offset = pageNumber * maxRows
    const limit = maxRows

    // Build base query
    let query = supabase
      .from(tableName)
      .select(columns)
      .eq(orgIdFilter, orgId)

    // Apply additional filters (e.g., neq for activities to exclude sequence markers)
    for (const filter of additionalFilters) {
      if (filter.operator === 'eq') {
        query = query.eq(filter.column, filter.value)
      } else if (filter.operator === 'neq') {
        query = query.neq(filter.column, filter.value)
      } else if (filter.operator === 'lt') {
        query = query.lt(filter.column, filter.value)
      } else if (filter.operator === 'gt') {
        query = query.gt(filter.column, filter.value)
      } else if (filter.operator === 'lte') {
        query = query.lte(filter.column, filter.value)
      } else if (filter.operator === 'gte') {
        query = query.gte(filter.column, filter.value)
      }
    }

    // Execute paginated query
    const { data, error } = await query
      .order(sortBy, { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      throw new Error(`Failed to fetch ${tableName}: ${error.message}`)
    }

    const records = ((data as unknown) as Record<string, unknown>[] | null) ?? []
    allRecords = allRecords.concat(records)

    // Check if more records exist
    hasMore = records.length === limit
    pageNumber++

    // Guard against runaway pagination
    if (pageNumber >= EXPORT_MAX_PAGES && hasMore) {
      throw new Error(
        `pagination_exceeded: Table '${tableName}' has too many records for single export. Contact support@dealerwyze.com for bulk data request.`
      )
    }
  }

  return allRecords
}

/**
 * Build result with pagination metadata.
 * Used internally to track page state across requests.
 */
export function buildExportPageResult(
  records: Record<string, unknown>[],
  pageNumber: number,
  pageSize: number
): ExportPageResult {
  const hasMore = records.length === pageSize
  return {
    records: hasMore ? records.slice(0, -1) : records, // Exclude the +1 sentinel record
    hasMore,
    pageNumber,
    totalRecords: records.length,
    nextCursor: hasMore ? (pageNumber + 1) * pageSize : undefined,
  }
}
