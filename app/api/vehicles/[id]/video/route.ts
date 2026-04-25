import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/vehicles/[id]/video — all renders + social posts for a vehicle
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Verify vehicle belongs to this org
  // Auth client (forRequest): RLS enforces org isolation for the ownership check on vehicles.
  const supabase = await createClientForRequest()
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Service client: video_renders and social_posts tables — RLS may not be configured; ownership already verified above.
  const svcClient = createServiceClient()

  const [{ data: renders }, { data: posts }] = await Promise.all([
    svcClient
      .from('video_renders')
      .select('id, status, output_url, narration_url, error_message, created_at, completed_at, template_id, aspect_ratio, voice_name')
      .eq('vehicle_id', vehicleId)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(10),

    svcClient
      .from('social_posts')
      .select('id, render_id, platform, status, platform_post_url, posted_at, error_message')
      .eq('vehicle_id', vehicleId)
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ renders: renders ?? [], posts: posts ?? [] })
}
