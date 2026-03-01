import { NextResponse } from 'next/server'
import { getProfile } from '@/lib/auth/profile'

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  return NextResponse.json({ id: profile.id, role: profile.role, org_id: profile.org_id })
}
