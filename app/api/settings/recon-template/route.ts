import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { DEFAULT_RECON_CHECKLIST, ReconChecklistTemplateItem } from '@/lib/recon/defaults'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('org_settings')
    .select('recon_checklist_template')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const template = (data?.recon_checklist_template as ReconChecklistTemplateItem[] | null) ?? DEFAULT_RECON_CHECKLIST

  return NextResponse.json({ template, is_custom: !!data?.recon_checklist_template })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role) && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = await createClient()

  let body: { template?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.template)) return NextResponse.json({ error: 'Invalid template' }, { status: 400 })
  if (body.template.length > 30) return NextResponse.json({ error: 'Max 30 items' }, { status: 400 })

  let template: ReconChecklistTemplateItem[]
  try {
    template = body.template.map((item: unknown, i: number) => {
      const t = item as Record<string, unknown>
      const label = String(t.label ?? '').trim().slice(0, 120)
      if (!label) throw new Error('empty label')
      return {
        label,
        is_required: Boolean(t.is_required),
        sort_order: i + 1,
      }
    })
  } catch {
    return NextResponse.json({ error: 'Invalid template items' }, { status: 400 })
  }

  const { error } = await supabase
    .from('org_settings')
    .update({ recon_checklist_template: template })
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Save failed' }, { status: 500 })

  return NextResponse.json({ template })
}
