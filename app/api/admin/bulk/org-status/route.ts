/**
 * PATCH /api/admin/bulk/org-status
 * Bulk change organization status (activate, suspend, deactivate).
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { bulkChangeOrgStatus } from '@/lib/admin/bulkOperations'
import { getClientIP } from '@/lib/auth/ip'

const BodySchema = z.object({
  org_ids: z.array(z.string().uuid()).min(1).max(100),
  new_status: z.enum(['active', 'suspended', 'deactivated']),
})

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const body = await req.json()
    const { org_ids, new_status } = BodySchema.parse(body)
    const ip = getClientIP(req)

    const result = await bulkChangeOrgStatus(org_ids, new_status, profile.id, ip)

    return NextResponse.json({
      succeeded: result.succeeded,
      failed: result.failed,
      total: org_ids.length,
      details: result.details,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 400 })
  }
}
