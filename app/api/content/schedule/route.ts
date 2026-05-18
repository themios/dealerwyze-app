import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile }         from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }    from '@/lib/supabase/service'
import { validateMcpToken }       from '@/lib/content/mcpAuth'
import { autoPostContentRender }  from '@/lib/content/autoPostContent'

const BodySchema = z.object({
  renderId:  z.string().uuid(),
  platforms: z.array(z.string()).min(1).max(6),
})

// POST /api/content/schedule — immediately post a completed content render to social platforms
// Requires the render to be in 'complete' status with an output_url
export async function POST(req: NextRequest) {
  let orgId: string

  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
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

  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { renderId, platforms } = parsed.data

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  // Verify render belongs to org and is complete
  const { data: render } = await supabase
    .from('content_renders')
    .select('id, status, output_url, auto_post_platforms')
    .eq('id', renderId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!render) {
    return NextResponse.json({ error: 'Render not found' }, { status: 404 })
  }

  if (render.status !== 'complete' || !render.output_url) {
    return NextResponse.json({ error: 'Render is not complete yet' }, { status: 409 })
  }

  // Update platforms and trigger posting
  await supabase
    .from('content_renders')
    .update({ auto_post: true, auto_post_platforms: platforms })
    .eq('id', renderId)

  const results = await autoPostContentRender(renderId)
  const anyOk   = results.some(r => r.ok)

  return NextResponse.json({
    ok:      anyOk,
    results,
  })
}
