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
 * (super admin OR platform staff). Short-circuits on super admin.
 */
export async function canAccessAdminArea(userId: string): Promise<boolean> {
  if (await isPlatformSuperAdmin(userId)) return true
  return isPlatformStaff(userId)
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
