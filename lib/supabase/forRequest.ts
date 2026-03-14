/**
 * createClientForRequest — returns service client (bypasses RLS) when a staff
 * impersonation session is active. All queries MUST explicitly scope by org_id.
 * For normal user sessions, returns the standard RLS-enforced client.
 */
import { cookies } from 'next/headers'
import { getStaffSessionInfo } from '@/lib/auth/staffSession'
import { createClient } from './server'
import { createServiceClient } from './service'

export async function createClientForRequest() {
  const jar = await cookies()
  if (getStaffSessionInfo(jar)?.orgId) return createServiceClient()
  return createClient()
}
