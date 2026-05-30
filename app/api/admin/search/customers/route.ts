/**
 * GET /api/admin/search/customers?org_id=...&q=...
 * Search customers within an organization.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { searchCustomers, getCustomerDetail } from '@/lib/admin/search'

const QuerySchema = z.object({
  org_id: z.string().uuid(),
  q: z.string().optional(),
  limit: z.string().optional(),
  detail: z.string().optional(), // customer_id for full detail view
})

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const { org_id, q, limit, detail } = QuerySchema.parse({
      org_id: searchParams.get('org_id'),
      q: searchParams.get('q'),
      limit: searchParams.get('limit'),
      detail: searchParams.get('detail'),
    })

    // Get full customer detail if requested
    if (detail) {
      const fullCustomer = await getCustomerDetail(detail, org_id)
      if (!fullCustomer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      return NextResponse.json(fullCustomer)
    }

    // Search customers
    const results = await searchCustomers(org_id, q ?? '', Math.min(parseInt(limit ?? '50', 10), 100))

    return NextResponse.json({
      count: results.length,
      results,
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 400 })
  }
}
