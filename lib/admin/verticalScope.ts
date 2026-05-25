/**
 * verticalScope — resolves org IDs for the current admin vertical.
 *
 * The x-vertical request header (set by proxy.ts on every request) tells us
 * which brand the admin is operating from. Every admin API that lists orgs,
 * alerts, retention data, etc. must scope its queries to the correct vertical
 * so dealer data never bleeds into the RealtyWyze admin and vice versa.
 *
 * Usage in an API route:
 *   const { isRE, orgIdFilter } = await getAdminVerticalScope(req)
 *   query.in('org_id', orgIdFilter)   // scope to current vertical
 */

import { type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface AdminVerticalScope {
  isRE: boolean
  /** Array of org IDs belonging to this vertical (excludes sentinel org). */
  orgIds: string[]
  /**
   * Apply this to any Supabase query that has an org_id column:
   *   .in('org_id', scope.orgIds)
   * Returns null if org list is empty (caller should return [] early).
   */
  orgIds_orEmpty: string[]
}

const SENTINEL = '00000000-0000-0000-0000-000000000001'

export async function getAdminVerticalScope(req: NextRequest): Promise<AdminVerticalScope> {
  const vertical = req.headers.get('x-vertical')
  const isRE = vertical === 'real_estate'

  const service = createServiceClient()

  let query = service
    .from('organizations')
    .select('id')
    .neq('id', SENTINEL)

  if (isRE) {
    query = query.eq('vertical', 'real_estate')
  } else {
    // dealer = explicit 'dealer' OR null (orgs created before vertical column existed)
    query = query.or('vertical.eq.dealer,vertical.is.null')
  }

  const { data } = await query
  const orgIds = (data ?? []).map(o => o.id)

  return { isRE, orgIds, orgIds_orEmpty: orgIds }
}
