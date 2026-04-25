import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { renderVehicleVideo } from '@/lib/remotion/renderVehicleVideo'
import { QuotaError } from '@/lib/remotion/quotaCheck'

export const maxDuration = 60 // seconds — allow time for narration + Lambda trigger

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/vehicles/[id]/render — trigger a new render
export async function POST(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Verify vehicle belongs to this org
  // Auth client (forRequest): RLS enforces org isolation for the ownership check on vehicles.
  const supabase = await createClientForRequest()
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, user_id')
    .eq('id', vehicleId)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: {
    templateId?: string
    photoUrls?: string[]
    voice?: string
    autoPost?: boolean
    platforms?: string[]
  } = {}
  try {
    body = await req.json()
  } catch {
    // No body is fine
  }

  try {
    const result = await renderVehicleVideo({
      orgId:          profile.org_id,
      vehicleId,
      triggeredByUser: profile.id,
      templateId:     body.templateId,
      photoUrls:      body.photoUrls,
      voice:          body.voice,
      autoPost:       body.autoPost,
      platforms:      body.platforms,
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: err.message }, { status: 429 })
    }
    console.error('[render] Error:', err)
    return NextResponse.json({ error: 'Render failed' }, { status: 500 })
  }
}

// PATCH /api/vehicles/[id]/render — cancel an in-progress render
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Auth client (forRequest): RLS enforces org isolation for the vehicle ownership check.
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

  let body: { action?: string; renderId?: string } = {}
  try { body = await req.json() } catch { /* no body */ }

  if (body.action !== 'cancel' || !body.renderId) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Service client: video_renders does not have RLS configured; explicit .eq('org_id') enforces isolation.
  const svcClient = createServiceClient()

  // Only allow cancelling queued/rendering renders belonging to this org
  const { data: render } = await svcClient
    .from('video_renders')
    .select('id, status')
    .eq('id', body.renderId)
    .eq('org_id', profile.org_id)
    .in('status', ['queued', 'rendering'])
    .maybeSingle()

  if (!render) {
    return NextResponse.json({ error: 'Render not found or already completed' }, { status: 404 })
  }

  await svcClient
    .from('video_renders')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', render.id)

  return NextResponse.json({ cancelled: true })
}

// GET /api/vehicles/[id]/render — get latest render status for this vehicle
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const profile = await requireProfile()
  const { id: vehicleId } = await params

  // Verify vehicle belongs to this org
  // Auth client (forRequest): RLS enforces org isolation for the vehicle ownership check.
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

  // Service client: video_renders does not have RLS configured; explicit .eq('org_id') enforces isolation.
  const svcClient = createServiceClient()
  const { data: render } = await svcClient
    .from('video_renders')
    .select('id, status, output_url, narration_url, error_message, created_at, completed_at, template_id, aspect_ratio')
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ render: render ?? null })
}
