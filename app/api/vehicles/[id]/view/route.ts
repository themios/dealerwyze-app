/**
 * POST /api/vehicles/[id]/view
 * Atomically increments views_count on a published vehicle.
 * Unauthenticated — called from public VDP pages.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = createServiceClient()
  await supabase.rpc('increment_vehicle_views', { p_vehicle_id: id })

  return NextResponse.json({ ok: true })
}
