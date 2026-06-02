/**
 * POST /api/admin/bulk/send-sms
 * Bulk send SMS to customers across an organization.
 * Requires platform superadmin.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  // DISABLED: This endpoint does not yet send actual SMS messages.
  // Pending implementation of real delivery + consent checks.
  // See SECURITY_AUDIT_EXECUTION.md for remediation timeline.
  return NextResponse.json(
    { error: 'Bulk SMS not yet implemented. Real delivery and consent workflows must be added before launch.' },
    { status: 501 }
  )
}
