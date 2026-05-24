import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { cache } from 'react'

/**
 * Returns true if userId is a DealerWyze platform super admin.
 * Cached per-request via React cache() — safe in both RSC and API routes.
 */
export const isPlatformSuperAdmin = cache(async (userId: string): Promise<boolean> => {
  const service = createServiceClient()
  const { data } = await service
    .from('platform_superusers')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return data !== null
})

/**
 * Returns true if userId has platform_role='platform_staff'.
 */
export async function isPlatformStaff(userId: string): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('platform_role')
    .eq('id', userId)
    .maybeSingle()
  return data?.platform_role === 'platform_staff'
}

/**
 * Returns true if userId can access /admin in any capacity
 * (super admin OR any platform role). Short-circuits on super admin.
 */
export async function canAccessAdminArea(userId: string): Promise<boolean> {
  if (await isPlatformSuperAdmin(userId)) return true
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('platform_role')
    .eq('id', userId)
    .maybeSingle()
  return !!data?.platform_role
}

/**
 * Throws a 403 NextResponse if userId is not a platform super admin.
 * Use at the top of all /api/admin/* route handlers.
 */
export async function requirePlatformSuperAdmin(
  userId: string
): Promise<NextResponse | null> {
  const ok = await isPlatformSuperAdmin(userId)
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/**
 * Returns the affiliate_code linked to a channel_rep profile,
 * or null if the user is not a channel rep.
 * Platform super admins are also allowed (returns null — they use admin routes).
 */
export async function getChannelRepCode(userId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('platform_role, affiliate_code')
    .eq('id', userId)
    .maybeSingle()
  if (data?.platform_role !== 'channel_rep') return null
  return data?.affiliate_code ?? null
}

/**
 * Returns a 403 if the user is not a channel_rep with a linked affiliate code.
 * On success returns { affiliateCode }.
 */
export async function requireChannelRep(
  userId: string
): Promise<{ denied: NextResponse; affiliateCode?: never } | { denied?: never; affiliateCode: string }> {
  const code = await getChannelRepCode(userId)
  if (!code) {
    return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { affiliateCode: code }
}

// ─── Expanded platform role system ───────────────────────────────────────────

export const PLATFORM_AREAS = [
  'accounts', 'retention', 'sales', 'analytics',
  'staff', 'tickets', 'alerts', 'audit', 'affiliates', 'commissions', 'billing',
] as const
export type PlatformArea = typeof PLATFORM_AREAS[number]

export type PlatformRole =
  | 'platform_superadmin'
  | 'platform_admin'
  | 'platform_staff_manager'
  | 'platform_sales_manager'
  | 'platform_staff'

export const ROLE_LABELS: Record<string, string> = {
  platform_superadmin:    'Super Admin',
  platform_admin:         'Admin',
  platform_staff_manager: 'Staff Manager',
  platform_sales_manager: 'Sales Manager',
  platform_staff:         'Support Staff',
}

// Default areas per role (for UI display and API access)
export const ROLE_DEFAULT_AREAS: Record<string, string[]> = {
  platform_staff_manager: ['accounts', 'retention', 'staff', 'tickets', 'alerts'],
  platform_sales_manager: ['accounts', 'retention', 'sales', 'analytics', 'affiliates', 'commissions'],
  platform_staff:         ['tickets', 'accounts'],
}

/**
 * Returns the user's platform profile (role + permissions).
 * Returns null if the user has no platform access.
 */
export async function getPlatformProfile(userId: string): Promise<{
  is_superadmin: boolean
  platform_role: string | null
  platform_permissions: string[]
} | null> {
  const is_superadmin = await isPlatformSuperAdmin(userId)
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('platform_role, platform_permissions')
    .eq('id', userId)
    .maybeSingle()

  if (!is_superadmin && !data?.platform_role) return null

  return {
    is_superadmin,
    platform_role:        data?.platform_role ?? null,
    platform_permissions: (data?.platform_permissions as string[]) ?? [],
  }
}

/**
 * Guards a route to any platform member (any platform_role or superadmin).
 */
export async function requirePlatformMember(userId: string): Promise<NextResponse | null> {
  if (await isPlatformSuperAdmin(userId)) return null
  const service = createServiceClient()
  const { data } = await service
    .from('profiles').select('platform_role').eq('id', userId).maybeSingle()
  if (!data?.platform_role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

/**
 * Guards a route to a specific platform area.
 * Superadmin always passes. platform_admin uses their platform_permissions[].
 * Other roles have fixed area sets.
 */
export async function requirePlatformArea(
  userId: string,
  area: PlatformArea
): Promise<NextResponse | null> {
  if (await isPlatformSuperAdmin(userId)) return null

  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('platform_role, platform_permissions')
    .eq('id', userId)
    .maybeSingle()

  if (!data?.platform_role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role        = data.platform_role
  const customPerms = (data.platform_permissions as string[]) ?? []

  const ROLE_AREAS: Record<string, string[]> = {
    platform_admin:          customPerms,
    platform_staff_manager:  ['accounts', 'retention', 'staff', 'tickets', 'alerts'],
    platform_sales_manager:  ['accounts', 'retention', 'sales', 'analytics', 'affiliates', 'commissions'],
    platform_staff:          ['tickets', 'accounts'],
  }

  if (!ROLE_AREAS[role]?.includes(area)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
