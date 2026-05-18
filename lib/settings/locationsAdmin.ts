import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import type { Profile } from '@/types/index'

export function unauthorizedSettingsResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}

export async function requireDealerAdminProfile(): Promise<Profile | NextResponse> {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role)) {
    return unauthorizedSettingsResponse()
  }
  return profile
}

export function isDealerAdminProfile(result: Profile | NextResponse): result is Profile {
  return !(result instanceof NextResponse)
}

export const DEALER_REP_ROLE = 'dealer_rep' as const
