/**
 * verticalScope — resolves org IDs for the current admin vertical.
 *
 * Detects the active vertical from the request host header directly, since
 * the proxy.ts middleware matcher excludes /api/* routes (they bypass the
 * middleware entirely). The host header is always present and reliable.
 *
 * Usage in an API route:
 *   const scope = await getAdminVerticalScope(req)
 *   query.in('org_id', scope.orgIds)   // scope to current vertical
 */

import { type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Hostnames that belong to the RealtyWyze vertical
const REALTY_HOSTS = ['realtywyze.us', 'realtywyze.localhost']

function isRealtyHost(req: NextRequest): boolean {
  const host = req.headers.get('host') ?? ''
  return REALTY_HOSTS.some(h => host.includes(h))
}

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
  const isRE = isRealtyHost(req)

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
