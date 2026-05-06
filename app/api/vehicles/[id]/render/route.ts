import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { renderVehicleVideo } from '@/lib/remotion/renderVehicleVideo'
import { QuotaError } from '@/lib/remotion/quotaCheck'

export const maxDuration = 120 // seconds — narration + Lambda trigger (Vercel ceiling)

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
    script?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    // No body is fine
  }

  // Validate custom script length if provided
  if (body.script !== undefined) {
    const trimmed = typeof body.script === 'string' ? body.script.trim() : ''
    if (trimmed.length > 1500) {
      return NextResponse.json({ error: 'Script must be 1,500 characters or fewer' }, { status: 422 })
    }
  }

  try {
    const result = await renderVehicleVideo(supabase, {
      orgId:          profile.org_id,
      vehicleId,
      triggeredByUser: profile.id,
      templateId:     body.templateId,
      photoUrls:      body.photoUrls,
      voice:          body.voice,
      autoPost:       body.autoPost,
      platforms:      body.platforms,
      customScript:   body.script?.trim() || undefined,
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

  // RLS on video_renders (migration 138) scopes by org via get_org_id()
  // Only allow cancelling queued/rendering renders belonging to this org
  const { data: render } = await supabase
    .from('video_renders')
    .select('id, status')
    .eq('id', body.renderId)
    .eq('org_id', profile.org_id)
    .in('status', ['queued', 'rendering'])
    .maybeSingle()

  if (!render) {
    return NextResponse.json({ error: 'Render not found or already completed' }, { status: 404 })
  }

  await supabase
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

  const { data: render } = await supabase
    .from('video_renders')
    .select('id, status, output_url, narration_url, error_message, created_at, completed_at, template_id, aspect_ratio')
    .eq('vehicle_id', vehicleId)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ render: render ?? null })
}
