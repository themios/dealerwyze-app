import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { autoPostVideo } from '@/lib/social/autoPost'

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/vehicles/[id]/post — manually trigger social posting for a completed render
export async function POST(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Verify vehicle belongs to this org
  // Auth client (forRequest): RLS enforces org isolation for all vehicle and video_renders ownership checks.
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

  let body: { renderId?: string; platforms?: string[] } = {}
  try {
    body = await req.json()
  } catch {
    // No body
  }

  if (!body.renderId) {
    return NextResponse.json({ error: 'renderId is required' }, { status: 400 })
  }

  // Verify render belongs to this org
  const { data: render } = await supabase
    .from('video_renders')
    .select('id, status')
    .eq('id', body.renderId)
    .eq('org_id', profile.org_id)
    .single()

  if (!render) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (render.status !== 'complete') {
    return NextResponse.json({ error: 'Video is not ready yet' }, { status: 400 })
  }

  try {
    await autoPostVideo(body.renderId, body.platforms)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[post] Error:', err)
    return NextResponse.json({ error: 'Posting failed' }, { status: 500 })
  }
}
