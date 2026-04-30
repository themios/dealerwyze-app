// app/api/pulse/scores/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url         = new URL(req.url)
  const days        = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
  const repId       = url.searchParams.get('rep_id') ?? null
  const triggerType = url.searchParams.get('trigger_type') ?? null
  const since       = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supabase = await createClient()

  let q = supabase
    .from('pulse_surveys')
    .select('id, assigned_rep_id, trigger_type, overall_score, completed_at, customer:customers(id, name)')
    .eq('org_id', profile.org_id)
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(200)

  if (repId)       q = q.eq('assigned_rep_id', repId)
  if (triggerType) q = q.eq('trigger_type', triggerType)

  const { data: surveys } = await q
  if (!surveys) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  if (surveys.length === 0) {
    return NextResponse.json({ overall_score: null, response_count: 0, by_category: [], recent: [] })
  }

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  const allScores = (responses ?? []).map(r => r.score)
  const overall = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
    : null

  const catMap: Record<string, number[]> = {}
  for (const r of responses ?? []) {
    if (!catMap[r.category]) catMap[r.category] = []
    catMap[r.category].push(r.score)
  }

  const by_category = Object.entries(catMap).map(([cat, scores]) => ({
    category: cat as Category,
    label:    CATEGORY_LABELS[cat as Category] ?? cat,
    score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    count:    scores.length,
  })).sort((a, b) => a.score - b.score) // worst-performing first

  const recent = surveys.slice(0, 20).map(s => ({
    id:            s.id,
    overall_score: s.overall_score,
    completed_at:  s.completed_at,
    customer:      s.customer,
    trigger_type:  s.trigger_type,
  }))

  return NextResponse.json({ overall_score: overall, response_count: surveys.length, by_category, recent })
}
