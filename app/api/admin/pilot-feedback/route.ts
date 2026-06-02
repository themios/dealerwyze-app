import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const PostSchema = z.object({
  org_id: z.string().uuid().optional().nullable(),
  agent_name: z.string().min(1).max(120).trim(),
  agent_email: z.string().email().max(200).trim().optional().nullable(),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  overall_rating: z.number().int().min(1).max(5).optional().nullable(),
  booking_flow_rating: z.number().int().min(1).max(5).optional().nullable(),
  email_delivery_ok: z.boolean().optional().nullable(),
  blockers: z.string().max(4000).trim().optional().nullable(),
  feature_requests: z.string().max(4000).trim().optional().nullable(),
  notes: z.string().max(4000).trim().optional().nullable(),
})

function submissionsOpen(): boolean {
  const flag = process.env.PILOT_FEEDBACK_OPEN
  if (flag === undefined || flag === '') return true
  return flag !== 'false' && flag !== '0'
}

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('pilot_feedback')
    .select(`
      id, org_id, agent_name, agent_email, session_date,
      overall_rating, booking_flow_rating, email_delivery_ok,
      blockers, feature_requests, notes, created_at,
      recorded_by,
      organizations ( name, slug )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[admin/pilot-feedback][GET]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    submissions_open: submissionsOpen(),
    entries: data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!submissionsOpen()) {
    return NextResponse.json({ error: 'Pilot feedback submissions are closed.' }, { status: 403 })
  }

  let body: z.infer<typeof PostSchema>
  try {
    const raw = await req.json()
    const parsed = PostSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('pilot_feedback')
    .insert({
      org_id: body.org_id ?? null,
      agent_name: body.agent_name,
      agent_email: body.agent_email ?? null,
      session_date: body.session_date ?? null,
      overall_rating: body.overall_rating ?? null,
      booking_flow_rating: body.booking_flow_rating ?? null,
      email_delivery_ok: body.email_delivery_ok ?? null,
      blockers: body.blockers ?? null,
      feature_requests: body.feature_requests ?? null,
      notes: body.notes ?? null,
      recorded_by: profile.id,
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[admin/pilot-feedback][POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id, created_at: data.created_at }, { status: 201 })
}
