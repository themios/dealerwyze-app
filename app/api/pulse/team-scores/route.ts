// app/api/pulse/team-scores/route.ts
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

  const url  = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supabase = await createClient()

  const { data: surveys } = await supabase
    .from('pulse_surveys')
    .select('id, assigned_rep_id, overall_score, rep:profiles!assigned_rep_id(id, display_name)')
    .eq('org_id', profile.org_id)
    .not('completed_at', 'is', null)
    .not('assigned_rep_id', 'is', null)
    .gte('completed_at', since)

  if (!surveys || surveys.length === 0) return NextResponse.json([])

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  // Group data by rep
  const repMap = new Map<string, { name: string; overallScores: number[]; catScores: Record<string, number[]> }>()
  for (const s of surveys) {
    const rep = s.rep as unknown as { id: string; display_name: string } | null
    if (!rep || !s.assigned_rep_id) continue
    if (!repMap.has(s.assigned_rep_id)) {
      repMap.set(s.assigned_rep_id, { name: rep.display_name, overallScores: [], catScores: {} })
    }
    const entry = repMap.get(s.assigned_rep_id)!
    if (s.overall_score !== null) entry.overallScores.push(s.overall_score as number)
  }
  for (const r of responses ?? []) {
    const survey = surveys.find(s => s.id === r.survey_id)
    if (!survey?.assigned_rep_id) continue
    const entry = repMap.get(survey.assigned_rep_id)
    if (!entry) continue
    if (!entry.catScores[r.category]) entry.catScores[r.category] = []
    entry.catScores[r.category].push(r.score)
  }

  const result = Array.from(repMap.entries()).map(([repId, { name, overallScores, catScores }]) => ({
    rep_id:         repId,
    name,
    overall_score:  overallScores.length > 0
      ? Math.round((overallScores.reduce((a, b) => a + b, 0) / overallScores.length) * 10) / 10
      : null,
    response_count: overallScores.length,
    by_category:    Object.entries(catScores).map(([cat, scores]) => ({
      category: cat as Category,
      label:    CATEGORY_LABELS[cat as Category] ?? cat,
      score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    })),
  })).sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))

  return NextResponse.json(result)
}
