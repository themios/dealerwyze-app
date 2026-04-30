/**
 * createClientForRequest
 *
 * Normal users get the standard RLS-enforced server client.
 *
 * Staff impersonation is split in two modes:
 * - read-only: returns an org-scoped privileged client, not a raw service-role client
 * - write-enabled remote admin: returns the raw service client explicitly
 */
import { cookies } from 'next/headers'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { createClient } from './server'
import { createServiceClient } from './service'
import { createScopedImpersonationClient } from './impersonation'

export async function createClientForRequest() {
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  if (staffSession?.orgId) {
    if (staffSession.writeMode) return createServiceClient()
    return createScopedImpersonationClient(staffSession.orgId)
  }
  return createClient()
}
