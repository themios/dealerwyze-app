// app/api/pulse/rep-feedback/route.ts
// Returns the calling rep's own anonymous feedback (no customer names)
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = await createClient()
  const since    = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: surveys } = await supabase
    .from('pulse_surveys')
    .select('id, overall_score, completed_at')
    .eq('org_id', profile.org_id)
    .eq('assigned_rep_id', profile.id)
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(20)

  if (!surveys || surveys.length === 0) return NextResponse.json([])

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  const result = surveys.map(s => {
    const sResponses = (responses ?? []).filter(r => r.survey_id === s.id)
    const catMap: Record<string, number[]> = {}
    for (const r of sResponses) {
      if (!catMap[r.category]) catMap[r.category] = []
      catMap[r.category].push(r.score)
    }
    const by_category = Object.entries(catMap).map(([cat, scores]) => ({
      category: cat as Category,
      label:    CATEGORY_LABELS[cat as Category] ?? cat,
      score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }))
    return { overall_score: s.overall_score, completed_at: s.completed_at, by_category }
  })

  return NextResponse.json(result)
}
