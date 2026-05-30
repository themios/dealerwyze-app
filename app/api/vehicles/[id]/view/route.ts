/**
 * POST /api/vehicles/[id]/view
 * Atomically increments views_count on a published vehicle.
 * Unauthenticated — called from public VDP pages.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { vdpViewLimiter } from '@/lib/rateLimit/upstash'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const { allowed } = await vdpViewLimiter(ip)
  if (!allowed) return NextResponse.json({ ok: true }) // silently ignore — no need to error the page

  const { id } = await params

  // Service client: this route is unauthenticated (public VDP) so there is no session for createClient() to use.
  const supabase = createServiceClient()
  await supabase.rpc('increment_vehicle_views', { p_vehicle_id: id })

  return NextResponse.json({ ok: true })
}
