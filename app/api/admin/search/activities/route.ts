/**
 * GET /api/admin/search/activities?org_id=...&q=...&type=...
 * Search activities (interactions) within an organization.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { searchActivities } from '@/lib/admin/search'

const QuerySchema = z.object({
  org_id: z.string().uuid(),
  q: z.string().optional(),
  type: z.string().optional(),
  direction: z.enum(['inbound', 'outbound']).optional(),
  channel: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const parsed = QuerySchema.parse({
      org_id: searchParams.get('org_id'),
      q: searchParams.get('q'),
      type: searchParams.get('type'),
      direction: searchParams.get('direction'),
      channel: searchParams.get('channel'),
      from_date: searchParams.get('from_date'),
      to_date: searchParams.get('to_date'),
      limit: searchParams.get('limit'),
    })

    const results = await searchActivities(parsed.org_id, parsed.q, {
      type: parsed.type,
      direction: parsed.direction,
      channel: parsed.channel,
      from_date: parsed.from_date,
      to_date: parsed.to_date,
    }, Math.min(parseInt(parsed.limit ?? '50', 10), 100))

    return NextResponse.json({
      count: results.length,
      results,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 400 })
  }
}
