import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile }         from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }    from '@/lib/supabase/service'
import { validateMcpToken }       from '@/lib/content/mcpAuth'
import { getOrgBrandConfig, upsertOrgBrandConfig } from '@/lib/content/brandConfig'

const PutSchema = z.object({
  brand_name:   z.string().min(1).max(80).optional(),
  brand_handle: z.string().min(1).max(80).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  bg_color:     z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  website:      z.string().max(120).optional(),
  logo_url:     z.string().url().optional(),
  cta_images:   z.array(z.string().url()).max(4).optional(),
  voice:        z.string().max(60).optional(),
  watermark:    z.boolean().optional(),
})


export async function GET(req: NextRequest) {
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()
  const config   = await getOrgBrandConfig(supabase, orgId)

  return NextResponse.json({ config })
}

export async function PUT(req: NextRequest) {
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

  const parsed = PutSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()

  try {
    await upsertOrgBrandConfig(supabase, orgId, parsed.data)
  } catch (err) {
    console.error('[content/brand-config] upsert error:', err)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
