/**
 * PATCH /api/admin/bulk/change-roles
 * Bulk change user roles within an organization.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { bulkChangeUserRoles } from '@/lib/admin/bulkOperations'
import { getClientIP } from '@/lib/auth/ip'

const BodySchema = z.object({
  org_id: z.string().uuid(),
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  new_role: z.enum(['agent', 'admin', 'dealer_admin']),
})

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const body = await req.json()
    const { org_id, user_ids, new_role } = BodySchema.parse(body)
    const ip = getClientIP(req)

    const result = await bulkChangeUserRoles(org_id, user_ids, new_role, profile.id, ip)

    return NextResponse.json({
      succeeded: result.succeeded,
      failed: result.failed,
      total: user_ids.length,
      details: result.details,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 400 })
  }
}
