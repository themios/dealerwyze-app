import type { Profile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'

/**
 * Returns true if the profile may access data belonging to orgId.
 * Passes for: profile.org_id === orgId OR platform super admin.
 * Use this in every dealer-facing API that receives an orgId parameter.
 */
export async function requireOrgAccess(
  profile: Profile,
  orgId: string
): Promise<boolean> {
  if (profile.org_id === orgId) return true
  return isPlatformSuperAdmin(profile.id)
}
