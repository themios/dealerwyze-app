export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { canViewDealerSecurityAudit } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import SecurityAuditClient from './SecurityAuditClient'

export default async function SecurityAuditPage() {
  const profile = await requireProfile()
  if (!canViewDealerSecurityAudit(profile.role as UserRole)) {
    redirect('/today')
  }
  return <SecurityAuditClient />
}
