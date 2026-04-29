import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { pulseSurveyResponseLimiter } from '@/lib/rateLimit/upstash'
import type { Category, Depth } from '@/lib/pulse/questions'

interface ResponseEntry {
  category: Category
  question_key: string
  score: number
  comment?: string
}

interface SubmitBody {
  depth: Depth
  responses: ResponseEntry[]
  wants_followup: boolean
}

const VALID_CATEGORIES = new Set<string>(['first_contact','rep','vehicle','process','facility','post_sale'])
const VALID_DEPTHS     = new Set<string>(['quick','standard','full'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await pulseSurveyResponseLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { token } = await params
  const supabase  = createServiceClient()

  const { data: survey } = await supabase
    .from('pulse_surveys')
    .select('id, org_id, customer_id, assigned_rep_id, completed_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!survey)             return NextResponse.json({ error: 'Not found' },        { status: 404 })
  if (survey.completed_at) return NextResponse.json({ error: 'already_completed' }, { status: 410 })
  if (new Date(survey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  let body: SubmitBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { depth, responses, wants_followup } = body

  if (!VALID_DEPTHS.has(depth)) {
    return NextResponse.json({ error: 'Invalid depth' }, { status: 400 })
  }
  if (!Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json({ error: 'Responses required' }, { status: 400 })
  }

  for (const r of responses) {
    if (!VALID_CATEGORIES.has(r.category))            return NextResponse.json({ error: 'Invalid category' },     { status: 400 })
    if (!r.question_key || typeof r.question_key !== 'string') return NextResponse.json({ error: 'Invalid question_key' }, { status: 400 })
    if (!Number.isInteger(r.score) || r.score < 1 || r.score > 5) return NextResponse.json({ error: 'Score must be 1-5' }, { status: 400 })
  }

  // Insert all responses
  const rows = responses.map(r => ({
    survey_id:    survey.id,
    org_id:       survey.org_id,
    category:     r.category,
    question_key: r.question_key,
    score:        r.score,
    comment:      r.comment ? r.comment.slice(0, 1000) : null,
  }))

  const { error: insertErr } = await supabase.from('pulse_responses').insert(rows)
  if (insertErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })

  // Compute overall average (exclude follow-up text questions - keys ending in _fu)
  const scoredResponses = responses.filter(r => !r.question_key.endsWith('_fu'))
  const overall = scoredResponses.length > 0
    ? Math.round((scoredResponses.reduce((a, r) => a + r.score, 0) / scoredResponses.length) * 100) / 100
    : null

  // Mark survey complete
  await supabase
    .from('pulse_surveys')
    .update({
      completed_at:  new Date().toISOString(),
      depth_chosen:  depth,
      wants_followup: wants_followup === true,
      overall_score: overall,
    })
    .eq('id', survey.id)

  // Create follow-up task if customer requested it
  if (wants_followup) {
    supabase.from('activities').insert({
      user_id:     survey.org_id,
      customer_id: survey.customer_id,
      type:        'task',
      direction:   'outbound',
      priority:    'high',
      outcome:     'pending',
      body:        'Customer requested follow-up on their satisfaction survey.',
      due_at:      new Date().toISOString(),
    }).then(() => {})
  }

  // Create admin_alert if any category average <= 2
  const catScores: Record<string, number[]> = {}
  for (const r of scoredResponses) {
    if (!catScores[r.category]) catScores[r.category] = []
    catScores[r.category].push(r.score)
  }
  const lowCategories = Object.entries(catScores)
    .filter(([, scores]) => scores.reduce((a, b) => a + b, 0) / scores.length <= 2)
    .map(([cat]) => cat)

  if (lowCategories.length > 0) {
    supabase.from('admin_alerts').insert({
      org_id:   survey.org_id,
      type:     'pulse_low_score',
      message:  `Low satisfaction score in: ${lowCategories.join(', ')}. Survey ${survey.id}`,
      resolved: false,
    }).then(() => {})
  }

  // Update assigned rep's rolling 90-day pulse_score on profiles
  if (survey.assigned_rep_id) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('pulse_surveys')
      .select('overall_score')
      .eq('org_id', survey.org_id)
      .eq('assigned_rep_id', survey.assigned_rep_id)
      .not('overall_score', 'is', null)
      .gte('completed_at', since)
      .then(({ data: repSurveys }) => {
        if (!repSurveys || repSurveys.length === 0) return
        const scores = repSurveys.map(s => s.overall_score as number)
        const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        supabase.from('profiles').update({
          pulse_score:            avg,
          pulse_score_updated_at: new Date().toISOString(),
        }).eq('id', survey.assigned_rep_id).then(() => {})
      })
  }

  return NextResponse.json({ ok: true })
}
