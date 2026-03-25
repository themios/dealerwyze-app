import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canAccessReports } from '@/lib/auth/dealerRoles'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const section = searchParams.get('section') ?? 'overview'
  const rawFrom = searchParams.get('from')
  const rawTo   = searchParams.get('to')

  const toDate   = rawTo   ? new Date(rawTo + 'T23:59:59') : new Date()
  const fromDate = rawFrom ? new Date(rawFrom)              : new Date(Date.now() - 30 * 86400000)

  if (
    isNaN(toDate.getTime()) || isNaN(fromDate.getTime()) ||
    (toDate.getTime() - fromDate.getTime()) / 86400000 > 366
  ) {
    return NextResponse.json({ error: 'Date range invalid or exceeds 366 days' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const orgId    = profile.org_id

  // ── Overview ──────────────────────────────────────────────────────────────
  if (section === 'overview') {
    const [{ data: acts }, { data: allCusts }, { data: profiles }] = await Promise.all([
      supabase
        .from('activities')
        .select('id,type,direction,outcome,created_at,customer_id,vehicle_id,created_by,customer_sequence_id')
        .eq('user_id', orgId)
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .limit(5000),
      supabase
        .from('customers')
        .select('id,thread_state,lead_rating,lead_source,response_time_seconds,assigned_to,created_at')
        .eq('user_id', orgId),
      supabase
        .from('profiles')
        .select('id,display_name,role')
        .eq('org_id', orgId),
    ])

    const activities    = acts ?? []
    const customers     = allCusts ?? []
    const periodCusts   = customers.filter(c =>
      new Date(c.created_at) >= fromDate && new Date(c.created_at) <= toDate
    )

    const inbound         = activities.filter(a => a.direction === 'inbound')
    const outbound        = activities.filter(a => a.direction === 'outbound')
    const autoresponder   = activities.filter(a => !!a.customer_sequence_id)
    const manualOutbound  = outbound.filter(a => !a.customer_sequence_id)

    const inboundCustIds  = new Set(inbound.map(a => a.customer_id).filter(Boolean))
    const outboundCustIds = new Set(outbound.map(a => a.customer_id).filter(Boolean))
    const respondedCount  = [...inboundCustIds].filter(id => outboundCustIds.has(id)).length
    const responseRate    = inboundCustIds.size > 0 ? respondedCount / inboundCustIds.size : 0

    const periodCustIdsWithActivity = new Set(activities.map(a => a.customer_id).filter(Boolean))
    const activePeriodCusts = customers.filter(c => periodCustIdsWithActivity.has(c.id))
    const responseTimes = activePeriodCusts.map(c => c.response_time_seconds).filter((v): v is number => v !== null && v !== undefined)
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null

    const byType: Record<string, number> = {}
    for (const a of activities) { byType[a.type] = (byType[a.type] ?? 0) + 1 }

    const bySource: Record<string, number> = {}
    for (const c of periodCusts) {
      const s = c.lead_source ?? 'Unknown'
      bySource[s] = (bySource[s] ?? 0) + 1
    }

    const byStage: Record<string, number> = {}
    for (const c of customers) {
      const s = c.thread_state ?? 'new_lead'
      byStage[s] = (byStage[s] ?? 0) + 1
    }

    const callOutcomes: Record<string, number> = {}
    for (const a of activities.filter(a => a.type === 'call')) {
      callOutcomes[a.outcome ?? 'unknown'] = (callOutcomes[a.outcome ?? 'unknown'] ?? 0) + 1
    }

    // Rep activity breakdown
    const repActivity: Record<string, { outbound: number; inbound: number; name: string }> = {}
    for (const p of (profiles ?? [])) {
      repActivity[p.id] = { outbound: 0, inbound: 0, name: p.display_name }
    }
    for (const a of activities) {
      if (a.created_by && repActivity[a.created_by]) {
        if (a.direction === 'outbound') repActivity[a.created_by].outbound++
        if (a.direction === 'inbound')  repActivity[a.created_by].inbound++
      }
    }

    return NextResponse.json({
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totals: {
        activities:      activities.length,
        inbound:         inbound.length,
        outbound:        outbound.length,
        autoresponder:   autoresponder.length,
        manualOutbound:  manualOutbound.length,
        uniqueLeads:     inboundCustIds.size,
        responded:       respondedCount,
        newCustomers:    periodCusts.length,
      },
      responseRate,
      avgResponseTimeSeconds: avgResponseTime,
      byType,
      bySource,
      byStage,
      callOutcomes,
      hotLeads: customers.filter(c => c.lead_rating === 'hot').length,
      repSummary: repActivity,
    })
  }

  // ── Reps ──────────────────────────────────────────────────────────────────
  if (section === 'reps') {
    const [{ data: acts }, { data: profiles }] = await Promise.all([
      supabase
        .from('activities')
        .select('id,type,direction,outcome,created_by,customer_id,customer_sequence_id,created_at')
        .eq('user_id', orgId)
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
        .limit(5000),
      supabase
        .from('profiles')
        .select('id,display_name,role')
        .eq('org_id', orgId),
    ])

    const activities = acts ?? []
    const reps: Record<string, {
      id: string; name: string; role: string
      outbound: number; inbound: number; autoresponder: number
      calls: number; sms: number; emails: number; notes: number
      answered: number; noAnswer: number; leftVm: number
      customerIds: Set<string>
    }> = {}

    for (const p of (profiles ?? [])) {
      reps[p.id] = {
        id: p.id, name: p.display_name, role: p.role,
        outbound: 0, inbound: 0, autoresponder: 0,
        calls: 0, sms: 0, emails: 0, notes: 0,
        answered: 0, noAnswer: 0, leftVm: 0,
        customerIds: new Set(),
      }
    }

    for (const a of activities) {
      const key = a.created_by ?? '__system__'
      if (!reps[key]) continue
      if (a.customer_id) reps[key].customerIds.add(a.customer_id)
      if (a.direction === 'outbound') reps[key].outbound++
      if (a.direction === 'inbound')  reps[key].inbound++
      if (a.customer_sequence_id)     reps[key].autoresponder++
      if (a.type === 'call')          reps[key].calls++
      if (a.type === 'sms' || a.type === 'sms_followup') reps[key].sms++
      if (a.type === 'email' || a.type === 'email_followup') reps[key].emails++
      if (a.type === 'note')          reps[key].notes++
      if (a.outcome === 'answered')   reps[key].answered++
      if (a.outcome === 'no_answer')  reps[key].noAnswer++
      if (a.outcome === 'left_vm')    reps[key].leftVm++
    }

    // Get assigned customer counts per rep
    const { data: assignedCusts } = await supabase
      .from('customers')
      .select('id,assigned_to,response_time_seconds')
      .eq('user_id', orgId)
      .not('assigned_to', 'is', null)

    const repAssignedCount: Record<string, number>   = {}
    const repResponseTimes: Record<string, number[]> = {}
    for (const c of (assignedCusts ?? [])) {
      if (!c.assigned_to) continue
      repAssignedCount[c.assigned_to]  = (repAssignedCount[c.assigned_to] ?? 0) + 1
      if (c.response_time_seconds) {
        if (!repResponseTimes[c.assigned_to]) repResponseTimes[c.assigned_to] = []
        repResponseTimes[c.assigned_to].push(c.response_time_seconds)
      }
    }

    const result = Object.values(reps).map(r => ({
      id: r.id, name: r.name, role: r.role,
      outbound: r.outbound, inbound: r.inbound,
      autoresponder: r.autoresponder,
      calls: r.calls, sms: r.sms, emails: r.emails, notes: r.notes,
      answered: r.answered, noAnswer: r.noAnswer, leftVm: r.leftVm,
      uniqueCustomers: r.customerIds.size,
      assignedTotal: repAssignedCount[r.id] ?? 0,
      avgResponseTimeSeconds: repResponseTimes[r.id]?.length
        ? repResponseTimes[r.id].reduce((a, b) => a + b, 0) / repResponseTimes[r.id].length
        : null,
    }))

    return NextResponse.json({ reps: result })
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────
  if (section === 'vehicles') {
    const { data: acts } = await supabase
      .from('activities')
      .select('id,type,direction,vehicle_id,customer_id,created_at,outcome')
      .eq('user_id', orgId)
      .not('vehicle_id', 'is', null)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .limit(3000)

    const vehicleIds = [...new Set((acts ?? []).map(a => a.vehicle_id).filter(Boolean))]

    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id,year,make,model,trim,stock_no,price,status')
      .in('id', vehicleIds.length > 0 ? vehicleIds : ['00000000-0000-0000-0000-000000000000'])

    const vMap: Record<string, { inquiries: number; uniqueCustomers: Set<string>; outbound: number }> = {}
    for (const a of (acts ?? [])) {
      if (!a.vehicle_id) continue
      if (!vMap[a.vehicle_id]) vMap[a.vehicle_id] = { inquiries: 0, uniqueCustomers: new Set(), outbound: 0 }
      if (a.direction === 'inbound')  vMap[a.vehicle_id].inquiries++
      if (a.direction === 'outbound') vMap[a.vehicle_id].outbound++
      if (a.customer_id) vMap[a.vehicle_id].uniqueCustomers.add(a.customer_id)
    }

    const result = (vehicles ?? []).map(v => ({
      ...v,
      inquiries:       vMap[v.id]?.inquiries ?? 0,
      uniqueCustomers: vMap[v.id]?.uniqueCustomers.size ?? 0,
      outbound:        vMap[v.id]?.outbound ?? 0,
    })).sort((a, b) => b.inquiries - a.inquiries)

    return NextResponse.json({ vehicles: result })
  }

  // ── Customer activity thread ───────────────────────────────────────────────
  if (section === 'customer') {
    const customerId = searchParams.get('id')
    if (!customerId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const [{ data: customer }, { data: activities }] = await Promise.all([
      supabase
        .from('customers')
        .select('id,name,primary_phone,email,lead_source,thread_state,lead_rating,assigned_to,response_time_seconds,first_response_at,created_at')
        .eq('id', customerId)
        .eq('user_id', orgId)
        .single(),
      supabase
        .from('activities')
        .select('id,type,direction,outcome,body,created_at,completed_at,created_by,customer_sequence_id,vehicle_id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true })
        .limit(200),
    ])

    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ customer, activities: activities ?? [] })
  }

  return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
}
