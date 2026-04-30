import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_ORG_STAGES, OrgStage, SYSTEM_STAGE_KEYS } from '@/lib/leads/states'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('org_pipeline_stages')
    .select('stage_key, label, color, position, is_hot, is_active')
    .eq('org_id', profile.org_id)
    .order('position', { ascending: true })

  if (error || !data?.length) {
    // Not yet seeded — return defaults
    return NextResponse.json(DEFAULT_ORG_STAGES)
  }

  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  let stages: OrgStage[]
  try {
    stages = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!Array.isArray(stages) || stages.length === 0) {
    return NextResponse.json({ error: 'Invalid stages array' }, { status: 400 })
  }

  // Validate: system stages must remain active
  for (const s of stages) {
    if (SYSTEM_STAGE_KEYS.includes(s.stage_key) && !s.is_active) {
      return NextResponse.json({ error: `System stage "${s.stage_key}" cannot be deactivated` }, { status: 400 })
    }
    if (!s.label?.trim()) {
      return NextResponse.json({ error: 'All active stages must have a label' }, { status: 400 })
    }
  }

  // Upsert all stages for this org
  const rows = stages.map((s, i) => ({
    org_id:    profile.org_id,
    stage_key: s.stage_key,
    label:     s.label.trim(),
    color:     s.color,
    position:  i,
    is_hot:    s.is_hot,
    is_active: SYSTEM_STAGE_KEYS.includes(s.stage_key) ? true : s.is_active,
  }))

  const { error } = await supabase
    .from('org_pipeline_stages')
    .upsert(rows, { onConflict: 'org_id,stage_key' })

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
