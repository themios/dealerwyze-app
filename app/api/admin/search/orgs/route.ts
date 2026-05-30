/**
 * GET /api/admin/search/orgs?q=...&status=...
 * Search organizations by name, email, or status.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { searchOrganizations } from '@/lib/admin/search'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') ?? ''
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)

  const results = await searchOrganizations(query, status || undefined, Math.min(limit, 100))

  return NextResponse.json({
    count: results.length,
    results,
  })
}
