import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile }         from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }    from '@/lib/supabase/service'
import { validateMcpToken }       from '@/lib/content/mcpAuth'
import { getOrgBrandConfig, applyBrandConfig } from '@/lib/content/brandConfig'
import { getRandomBrandPhoto }    from '@/lib/content/photoLibrary'
import { renderContentReel }      from '@/lib/content/renderContentReel'

const SlideSchema = z.object({
  headline: z.string().min(1).max(120),
  body:     z.string().max(280).optional(),
  emoji:    z.string().max(8).optional(),
})

const PatchSchema = z.object({
  action:          z.enum(['approve', 'reject', 'edit', 'schedule', 'archive']),
  // edit-only fields
  topic:           z.string().min(1).max(120).optional(),
  tagline:         z.string().max(120).optional(),
  slides:          z.array(SlideSchema).min(1).max(6).optional(),
  cta_text:        z.string().min(1).max(120).optional(),
  platform_targets: z.array(z.string()).max(6).optional(),
  // schedule-only fields
  scheduled_at:    z.string().datetime().optional(),
  // approve-only options
  background_image_url: z.string().url().optional(),  // override auto-pick
  auto_post:       z.boolean().default(false),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string
  let userId: string | undefined

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId  = profile.org_id
    userId = profile.id
  }

  let raw: unknown
  try { raw = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  // Fetch the draft — service client filtered by org_id; RLS handles session client
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { action } = parsed.data

  if (action === 'schedule') {
    await supabase.from('content_drafts').update({
      scheduled_at: parsed.data.scheduled_at ?? null,
      updated_at:   new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true, scheduled_at: parsed.data.scheduled_at ?? null })
  }

  if (action === 'archive') {
    await supabase.from('content_drafts').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'archived' })
  }

  if (action === 'reject') {
    await supabase.from('content_drafts').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  if (action === 'edit') {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.topic)            updates.topic            = parsed.data.topic
    if (parsed.data.tagline)          updates.tagline          = parsed.data.tagline
    if (parsed.data.slides)           updates.slides           = parsed.data.slides
    if (parsed.data.cta_text)         updates.cta_text         = parsed.data.cta_text
    if (parsed.data.platform_targets) updates.platform_targets = parsed.data.platform_targets
    await supabase.from('content_drafts').update(updates).eq('id', id)
    return NextResponse.json({ ok: true, status: 'edited' })
  }

  // action === 'approve' — pick background photo and trigger render
  const config = await getOrgBrandConfig(supabase, orgId)

  let backgroundImageUrl = parsed.data.background_image_url
  if (!backgroundImageUrl) {
    // Auto-pick from org photo library, filtered by draft's background_tags
    backgroundImageUrl = await getRandomBrandPhoto(supabase, orgId, draft.background_tags) ?? undefined
  }

  const baseProps = applyBrandConfig({
    topic:              draft.topic,
    tagline:            draft.tagline ?? undefined,
    slides:             draft.slides,
    ctaText:            draft.cta_text,
    backgroundImageUrl,
  }, config)

  const { renderId } = await renderContentReel(supabase, {
    orgId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props:             baseProps as any,
    autoPost:          parsed.data.auto_post,
    platforms:         draft.platform_targets,
    triggeredByUser:   userId,
  })

  await supabase.from('content_drafts').update({
    status:      'approved',
    render_id:   renderId,
    approved_by: userId ?? null,
    approved_at: new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, status: 'approved', renderId })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ draft })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  const { error } = await supabase
    .from('content_drafts')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
