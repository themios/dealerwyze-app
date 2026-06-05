import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile }         from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }    from '@/lib/supabase/service'
import { validateMcpToken }       from '@/lib/content/mcpAuth'
import { getOrgBrandConfig }      from '@/lib/content/brandConfig'
import { generateDraftBatch }     from '@/lib/content/draftGenerator'

const GenerateSchema = z.object({
  count:          z.number().int().min(1).max(50).default(10),
  is_buyer_facing: z.boolean().default(false),
  themes:         z.array(z.string()).optional(),
})

const SlideSchema = z.object({
  headline: z.string().min(1).max(120),
  body:     z.string().max(280).optional(),
  emoji:    z.string().max(8).optional(),
})

// Manual save: agent-written draft with slide structure + platform captions
const SaveDraftSchema = z.object({
  action:            z.literal('save'),
  topic:             z.string().min(1).max(120),
  tagline:           z.string().max(120).optional(),
  slides:            z.array(SlideSchema).min(1).max(6),
  cta_text:          z.string().min(1).max(120),
  platform_targets:  z.array(z.string()).max(6).default([]),
  background_tags:   z.array(z.string()).max(10).default([]),
  content_theme:     z.string().max(60).optional(),
  platform_captions: z.record(z.string(), z.string()).default({}),
})

// GET /api/content/drafts — list drafts, optionally filtered by status
export async function GET(req: NextRequest) {
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // pending | approved | rejected | rendered

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  let query = supabase
    .from('content_drafts')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data: drafts, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })

  return NextResponse.json({ drafts })
}

// POST /api/content/drafts — save a single agent-written draft OR generate a batch
export async function POST(req: NextRequest) {
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  // Manual save path: agent-written draft with slides + platform captions
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).action === 'save') {
    const parsed = SaveDraftSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    const { data: draft, error } = await supabase
      .from('content_drafts')
      .insert({
        org_id:            orgId,
        status:            'pending',
        topic:             parsed.data.topic,
        tagline:           parsed.data.tagline ?? null,
        slides:            parsed.data.slides,
        cta_text:          parsed.data.cta_text,
        platform_targets:  parsed.data.platform_targets,
        background_tags:   parsed.data.background_tags,
        content_theme:     parsed.data.content_theme ?? null,
        platform_captions: parsed.data.platform_captions,
      })
      .select('id, topic, status')
      .single()

    if (error) return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
    return NextResponse.json({ draft }, { status: 201 })
  }

  // Batch generation path
  const parsed = GenerateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const config = await getOrgBrandConfig(supabase, orgId)

  if (!config) {
    return NextResponse.json(
      { error: 'Brand config not set up. Call PUT /api/content/brand-config first.' },
      { status: 400 },
    )
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', orgId)
    .maybeSingle()

  const drafts = await generateDraftBatch(supabase, orgId, config, {
    count:          parsed.data.count,
    isBuyerFacing:  parsed.data.is_buyer_facing,
    themes:         parsed.data.themes,
    vertical:       (org?.vertical ?? 'dealer') as 'dealer' | 'real_estate',
  })

  return NextResponse.json({ drafts, count: drafts.length }, { status: 201 })
}
