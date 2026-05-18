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

// POST /api/content/drafts — generate a batch of AI-written scripts
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

  const parsed = GenerateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()
  const config   = await getOrgBrandConfig(supabase, orgId)

  if (!config) {
    return NextResponse.json(
      { error: 'Brand config not set up. Call PUT /api/content/brand-config first.' },
      { status: 400 },
    )
  }

  const drafts = await generateDraftBatch(supabase, orgId, config, {
    count:          parsed.data.count,
    isBuyerFacing:  parsed.data.is_buyer_facing,
    themes:         parsed.data.themes,
  })

  return NextResponse.json({ drafts, count: drafts.length }, { status: 201 })
}
