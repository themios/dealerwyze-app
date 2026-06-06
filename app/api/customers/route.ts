/**
 * GET /api/customers?location_id=<uuid|unassigned>
 * Org-scoped customer list. Optional location filter; omit param for all locations.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isRepRestricted } from '@/lib/auth/dealerRoles'
import { applyCustomerLocationFilter, isValidOrgLocationId } from '@/lib/customers/listQuery'
import { apiError } from '@/lib/api/errorHandler'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()
  const isOrgOwner = profile.id === profile.org_id
  const isRep = isRepRestricted(profile.role) && !isOrgOwner

  const locationParam = req.nextUrl.searchParams.get('location_id')?.trim() ?? ''
  let locationFilter: string | null = null
  if (locationParam === 'unassigned') {
    locationFilter = 'unassigned'
  } else if (locationParam) {
    const valid = await isValidOrgLocationId(supabase, profile.org_id, locationParam)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid location_id' }, { status: 400 })
    }
    locationFilter = locationParam
  }

  let query = supabase
    .from('customers')
    .select('*')
    .eq('user_id', profile.org_id)
    .is('merged_at', null)
    .or('archived.is.null,archived.eq.false')

  if (isRep) {
    query = query.eq('assigned_to', profile.id)
  }

  query = applyCustomerLocationFilter(query, locationFilter)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(500)

  if (error) {
    return apiError(error, {
      route: 'GET /api/customers',
      action: 'fetch_customers',
      userId: profile.id,
      orgId: profile.org_id,
    })
  }

  return NextResponse.json(data ?? [])
}
