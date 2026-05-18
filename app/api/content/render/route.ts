import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile }        from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }   from '@/lib/supabase/service'
import { validateMcpToken }      from '@/lib/content/mcpAuth'
import { renderContentReel }     from '@/lib/content/renderContentReel'

const SlideSchema = z.object({
  headline:           z.string().min(1).max(120),
  body:               z.string().max(280).optional(),
  emoji:              z.string().max(8).optional(),
  backgroundImageUrl: z.string().url().optional(),
})

const BodySchema = z.object({
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

export const maxDuration = 120

// POST /api/content/render — trigger a ContentReel render
// Accepts either user session auth or MCP bearer token
export async function POST(req: NextRequest) {
  let orgId: string
  let userId: string | undefined

  // Try MCP token first
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    // Fall back to user session
    const profile = await requireProfile()
    orgId  = profile.org_id
    userId = profile.id
  }

  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { autoPost, platforms, ...props } = parsed.data

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  try {
    const result = await renderContentReel(supabase, {
      orgId,
      props,
      autoPost,
      platforms,
      triggeredByUser: userId,
    })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[content/render] Error:', err)
    return NextResponse.json({ error: 'Render failed' }, { status: 500 })
  }
}

// GET /api/content/render?id=<renderId> — poll render status
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

  const { data: render } = await supabase
    .from('content_renders')
    .select('id, status, output_url, error_message, post_results, created_at, completed_at')
    .eq('id', renderId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!render) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ render })
}
