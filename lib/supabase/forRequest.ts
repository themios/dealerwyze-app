/**
 * createClientForRequest
 *
 * Normal users get the standard RLS-enforced server client (cookie session).
 *
 * Staff impersonation (signed dealerwyze_staff_org_id cookie): returns a Supabase
 * client authorized as a real user in that org (short-lived JWT), so RLS applies.
 * Raw service-role is never returned to application code from this helper.
 */
import { cookies } from 'next/headers'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { createClient } from './server'
import { createScopedImpersonationClient } from './impersonation'

export async function createClientForRequest() {
  const jar = await cookies()
  const staffSession = getStaffSessionInfo(jar)
  if (staffSession?.orgId) {
    return createScopedImpersonationClient(staffSession.orgId)
  }
  return createClient()
}
