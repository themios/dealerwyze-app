import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { pulseSurveyViewLimiter } from '@/lib/rateLimit/upstash'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed } = await pulseSurveyViewLimiter(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })
  }

  const { token } = await params
  const supabase = createServiceClient()

  const { data: survey } = await supabase
    .from('pulse_surveys')
    .select('id, completed_at, expires_at, customer:customers(name), org:organizations(name)')
    .eq('token', token)
    .maybeSingle()

  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (survey.completed_at) {
    return NextResponse.json({ error: 'already_completed' }, { status: 410 })
  }
  if (new Date(survey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Mark opened_at on first visit (fire-and-forget, ignore errors)
  supabase
    .from('pulse_surveys')
    .update({ opened_at: new Date().toISOString() })
    .eq('token', token)
    .is('opened_at', null)
    .then(() => {})

  const customer = survey.customer as unknown as { name: string } | null
  const org      = survey.org      as unknown as { name: string } | null

  return NextResponse.json({
    survey_id:           survey.id,
    customer_first_name: customer?.name?.split(' ')[0] ?? 'there',
    org_name:            org?.name ?? 'the dealership',
  })
}
