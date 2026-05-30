/**
 * POST /api/admin/bulk/send-email
 * Bulk send email to customers across an organization.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { bulkSendEmail } from '@/lib/admin/bulkOperations'
import { getClientIP } from '@/lib/auth/ip'

const BodySchema = z.object({
  org_id: z.string().uuid(),
  customer_ids: z.array(z.string().uuid()).min(1).max(1000),
  template_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const body = await req.json()
    const { org_id, customer_ids, template_id } = BodySchema.parse(body)
    const ip = getClientIP(req)

    const result = await bulkSendEmail(org_id, customer_ids, template_id, profile.id, ip)

    return NextResponse.json({
      succeeded: result.succeeded,
      failed: result.failed,
      total: customer_ids.length,
      details: result.details,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 400 })
  }
}
