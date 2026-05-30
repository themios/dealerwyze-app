import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { orgTodayBulkLimiter } from '@/lib/rateLimit/upstash'
import { buildLostLeadAuditRow, type LostLeadAuditInsert } from '@/lib/intelligence/lostLeadAudit'

const bulkSchema = z.object({
  activityIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(['park', 'trust_sequence', 'archive', 'low_roi', 'restart']),
})

function defaultParkUntil(): string {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(8, 0, 0, 0)
  return next.toISOString()
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const rate = await orgTodayBulkLimiter(profile.org_id)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many bulk actions. Please try again in a moment.' }, { status: 429 })
  }

  const parsed = bulkSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { activityIds, action } = parsed.data
  const supabase = await createClient()
  const { data: owned, count } = await supabase
    .from('activities')
    .select('id, customer_id', { count: 'exact' })
    .in('id', activityIds)
    .eq('user_id', profile.org_id)

  if ((count ?? 0) !== activityIds.length) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const nowIso = new Date().toISOString()
  const updates: Record<string, unknown> = {}
  let insertedAuditIds: string[] = []
  switch (action) {
    case 'park':
      updates.today_section_override = 'follow_up_later'
      updates.today_park_until = defaultParkUntil()
      break
    case 'trust_sequence':
      updates.today_section_override = 'ai_handling'
      updates.today_park_until = null
      updates.snoozed_until = null
      break
    case 'low_roi':
      updates.today_section_override = 'low_roi'
      updates.today_park_until = null
      break
    case 'restart':
      updates.today_section_override = null
      updates.today_park_until = null
      updates.snoozed_until = null
      break
    case 'archive':
      {
        const auditRows = await Promise.all(activityIds.map(activityId =>
          buildLostLeadAuditRow({
            activityId,
            orgId: profile.org_id,
            archivedBy: profile.id,
            archiveReason: 'bulk',
            lossReason: null,
          }),
        ))

        const validAuditRows = auditRows.filter((row): row is LostLeadAuditInsert => row !== null)
        if (validAuditRows.length === 0) {
          return NextResponse.json({ error: 'Failed to build audit snapshots.' }, { status: 500 })
        }

        const { data: inserted, error: insertError } = await supabase
          .from('lost_lead_audit')
          .insert(validAuditRows)
          .select('id')

        if (insertError) {
          return NextResponse.json({ error: 'Failed to write audit snapshots.' }, { status: 500 })
        }
        insertedAuditIds = (inserted ?? []).map(row => row.id as string)
      }
      updates.completed_at = nowIso
      updates.today_section_override = null
      updates.today_park_until = null
      break
  }

  const { error } = await supabase
    .from('activities')
    .update(updates)
    .in('id', activityIds)
    .eq('user_id', profile.org_id)

  if (error) {
    if (insertedAuditIds.length > 0) {
      await supabase.from('lost_lead_audit').delete().in('id', insertedAuditIds)
    }
    return NextResponse.json({ error: 'Failed to update Today state.' }, { status: 500 })
  }

  if (action === 'trust_sequence' || action === 'restart') {
    const customerIds = Array.from(new Set((owned ?? []).map(row => row.customer_id).filter(Boolean)))
    if (customerIds.length > 0) {
      await supabase
        .from('customer_sequences')
        .update({ status: 'active', stop_reason: null, stopped_at: null })
        .eq('org_id', profile.org_id)
        .in('customer_id', customerIds)
        .eq('status', 'paused')
    }
  }

  return NextResponse.json({ ok: true, count: activityIds.length })
}
