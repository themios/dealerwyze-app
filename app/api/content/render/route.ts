import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient } from '@/lib/supabase/service'
import { validateMcpToken } from '@/lib/content/mcpAuth'
import { renderContentReel } from '@/lib/content/renderContentReel'
import { renderVehicleVideo } from '@/lib/remotion/renderVehicleVideo'
import { QuotaError } from '@/lib/remotion/quotaCheck'

const SlideSchema = z.object({
  headline:           z.string().min(1).max(120),
  body:               z.string().max(280).optional(),
  emoji:              z.string().max(8).optional(),
  backgroundImageUrl: z.string().url().optional(),
})

const ContentBodySchema = z.object({
  vehicle_id:         z.string().uuid().optional(),
  template_id:        z.string().uuid().optional(),
  customScript:       z.string().max(1500).optional(),
  brandName:          z.string().min(1).max(60),
  brandHandle:        z.string().min(1).max(60),
  accentColor:        z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f97316'),
  bgColor:            z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0f172a'),
  topic:              z.string().min(1).max(120),
  tagline:            z.string().max(120).optional(),
  slides:             z.array(SlideSchema).min(1).max(6),
  ctaText:            z.string().min(1).max(120),
  watermark:          z.boolean().default(true),
  logoUrl:            z.string().url().optional(),
  website:            z.string().max(100).optional(),
  backgroundImageUrl: z.string().url().optional(),
  ctaImages:          z.array(z.string().url()).max(4).optional(),
  narrationUrl:       z.string().url().optional(),
  autoPost:           z.boolean().default(false),
  platforms:          z.array(z.string()).max(6).default([]),
})

const VehicleBodySchema = z.object({
  vehicle_id:   z.string().uuid(),
  template_id:  z.string().uuid().optional(),
  customScript: z.string().max(1500).optional(),
  autoPost:     z.boolean().default(false),
  platforms:    z.array(z.string()).max(6).default([]),
})

export const maxDuration = 120

function renderResponse(renderId: string, status: 'queued') {
  return NextResponse.json({ renderId, job_id: renderId, status })
}

// POST /api/content/render — ContentReel or vehicle tour via Remotion Lambda
export async function POST(req: NextRequest) {
  let orgId: string
  let userId: string | undefined

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
    userId = profile.id
  }

  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  // Vehicle / listing tour render (property showings, inventory reels)
  if (raw && typeof raw === 'object' && 'vehicle_id' in raw && !('slides' in raw)) {
    const parsed = VehicleBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', parsed.data.vehicle_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!vehicle) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    try {
      const result = await renderVehicleVideo(supabase, {
        orgId,
        vehicleId: parsed.data.vehicle_id,
        templateId: parsed.data.template_id,
        triggeredByUser: userId,
        customScript: parsed.data.customScript,
        autoPost: parsed.data.autoPost,
        platforms: parsed.data.platforms,
      })
      return renderResponse(result.renderId, result.status)
    } catch (err) {
      if (err instanceof QuotaError) {
        return NextResponse.json({ error: err.message }, { status: 402 })
      }
      console.error('[content/render] vehicle render error:', err)
      return NextResponse.json({ error: 'Render failed' }, { status: 500 })
    }
  }

  const parsed = ContentBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { autoPost, platforms, vehicle_id, template_id, customScript, ...props } = parsed.data

  if (vehicle_id) {
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', vehicle_id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!vehicle) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    try {
      const result = await renderVehicleVideo(supabase, {
        orgId,
        vehicleId: vehicle_id,
        templateId: template_id,
        triggeredByUser: userId,
        customScript,
        autoPost,
        platforms,
      })
      return renderResponse(result.renderId, result.status)
    } catch (err) {
      if (err instanceof QuotaError) {
        return NextResponse.json({ error: err.message }, { status: 402 })
      }
      console.error('[content/render] vehicle render error:', err)
      return NextResponse.json({ error: 'Render failed' }, { status: 500 })
    }
  }

  try {
    const result = await renderContentReel(supabase, {
      orgId,
      props,
      autoPost,
      platforms,
      triggeredByUser: userId,
    })
    return renderResponse(result.renderId, result.status)
  } catch (err) {
    console.error('[content/render] content reel error:', err)
    return NextResponse.json({ error: 'Render failed' }, { status: 500 })
  }
}

// GET /api/content/render?id=<renderId> — poll content or vehicle render status
export async function GET(req: NextRequest) {
  let orgId: string

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const renderId = req.nextUrl.searchParams.get('id')
  if (!renderId) {
    return NextResponse.json({ error: 'Missing id param' }, { status: 400 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  const { data: contentRender } = await supabase
    .from('content_renders')
    .select('id, status, output_url, error_message, post_results, created_at, completed_at')
    .eq('id', renderId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (contentRender) {
    return NextResponse.json({ render: contentRender, kind: 'content' })
  }

  const { data: videoRender } = await supabase
    .from('video_renders')
    .select('id, status, output_url, error_message, vehicle_id, created_at, completed_at')
    .eq('id', renderId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (videoRender) {
    return NextResponse.json({ render: videoRender, kind: 'vehicle' })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
