import { SupabaseClient } from '@supabase/supabase-js'

export interface DashboardStats {
  today: {
    urgent_leads: number
    tasks_due_today: number
    tasks_overdue: number
    appt_requests: number
  }
  leads: {
    open_leads: number
    responded_today: number
    avg_response_seconds: number | null
  }
  inventory: {
    available_count: number
    staging_count: number
    overpriced: number
    at_market: number
    underpriced: number
    unchecked: number
    avg_days: number | null
  }
  bhph: {
    active_loans: number
    overdue: number
    due_this_week: number
    overdue_amount: number
  }
  gamification: {
    dealer_score: number
    response_streak_days: number
    goals_today: Array<{ label: string; target: number; actual: number }>
    wins_this_week: number
    revenue_this_week: number
  }
  org_name: string
}

export async function computeDashboardStats(
  supabase: SupabaseClient,
  orgId: string,
  orgName: string,
): Promise<DashboardStats> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const weekStart  = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  const next7d        = new Date(now.getTime() + 7 * 86400000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
  const sevenDaysAgo  = new Date(now.getTime() - 7 * 86400000)

  const nowIso       = now.toISOString()
  const todayStartIso = todayStart.toISOString()
  const todayEndIso   = todayEnd.toISOString()
  const weekStartIso  = weekStart.toISOString()

  const [
    { count: urgentLeads },
    { count: tasksDueToday },
    { count: tasksOverdue },
    { count: apptRequests },
    { count: tasksDoneToday },
    { data: respondedTodayData },
    { data: responseTimeData },
    { data: availableVehicles },
    { count: stagingCount },
    { data: bhphPortfolio },
    { data: soldThisWeek },
    { data: inboundLast30d },
    { data: outboundLast30d },
  ] = await Promise.all([
    // Urgent: inbound email leads, pending, not snoozed
    supabase.from('activities').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound')
      .eq('outcome', 'pending').is('completed_at', null)
      .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`),
    // Tasks due today
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('status', 'open')
      .gte('due_at', todayStartIso).lte('due_at', todayEndIso),
    // Tasks overdue
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('status', 'open')
      .lt('due_at', todayStartIso).not('due_at', 'is', null),
    // Appointment requests pending
    supabase.from('activities').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('type', 'appointment').eq('direction', 'inbound')
      .eq('outcome', 'pending').is('completed_at', null),
    // Tasks completed today (for score)
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('status', 'done')
      .gte('updated_at', todayStartIso),
    // Outbound activities today (unique customers = responded today)
    supabase.from('activities').select('customer_id')
      .eq('user_id', orgId).in('type', ['email', 'sms', 'call']).eq('direction', 'outbound')
      .gte('created_at', todayStartIso),
    // Avg response time (7d) from customers table
    supabase.from('customers').select('response_time_seconds')
      .eq('user_id', orgId).not('response_time_seconds', 'is', null)
      .gte('created_at', sevenDaysAgo.toISOString()).limit(500),
    // Available vehicles (for pricing split + avg days)
    supabase.from('vehicles').select('id,price,market_data_json,created_at')
      .eq('user_id', orgId).eq('status', 'available'),
    // Staging count
    supabase.from('vehicles').select('id', { count: 'exact', head: true })
      .eq('user_id', orgId).eq('status', 'staging'),
    // BHPH portfolio
    supabase.from('bhph_payments').select('id,monthly_payment,next_due_date,status')
      .eq('user_id', orgId),
    // Vehicles sold this week (for wins + revenue)
    supabase.from('vehicles').select('id,sold_price')
      .eq('user_id', orgId).eq('status', 'sold')
      .gte('sold_at', weekStartIso).not('sold_at', 'is', null),
    // Inbound last 30d (for streak)
    supabase.from('activities').select('created_at,customer_id')
      .eq('user_id', orgId).in('type', ['email', 'sms']).eq('direction', 'inbound')
      .gte('created_at', thirtyDaysAgo.toISOString()),
    // Outbound last 30d (for streak)
    supabase.from('activities').select('created_at,customer_id')
      .eq('user_id', orgId).in('type', ['email', 'sms', 'call']).eq('direction', 'outbound')
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  // ── Inventory ────────────────────────────────────────────────────────────────
  const available = availableVehicles ?? []
  const availableCount = available.length
  let overpriced = 0, atMarket = 0, underpriced = 0, unchecked = 0, totalDays = 0

  for (const v of available) {
    const days = Math.floor((now.getTime() - new Date(v.created_at).getTime()) / 86400000)
    totalDays += days
    const fmv  = (v.market_data_json as { fairMarketPrice?: number } | null)?.fairMarketPrice
    const list = v.price ? Number(v.price) : null
    if (!fmv || !list || fmv <= 0) { unchecked++; continue }
    const pct  = ((list / fmv) - 1) * 100
    if (pct > 6) overpriced++
    else if (pct < -3) underpriced++
    else atMarket++
  }
  const avgDays = availableCount > 0 ? Math.round(totalDays / availableCount) : null

  // ── BHPH ─────────────────────────────────────────────────────────────────────
  const bhph        = bhphPortfolio ?? []
  const bhphActive  = bhph.filter(b => b.status === 'active')
  const bhphOverdue = bhphActive.filter(b => b.next_due_date && new Date(b.next_due_date) < todayStart)
  const bhphDue7d   = bhphActive.filter(b => {
    if (!b.next_due_date) return false
    const d = new Date(b.next_due_date)
    return d >= todayStart && d <= next7d
  })
  const overdueAmount = Math.round(bhphOverdue.reduce((s, b) => s + (Number(b.monthly_payment) || 0), 0))

  // ── Avg response time ─────────────────────────────────────────────────────────
  const rtimes = (responseTimeData ?? []).map(c => Number(c.response_time_seconds)).filter(n => n > 0)
  const avgResponseSeconds = rtimes.length > 0
    ? Math.round(rtimes.reduce((a, b) => a + b, 0) / rtimes.length)
    : null

  // ── Responded today ───────────────────────────────────────────────────────────
  const respondedToday = new Set(
    (respondedTodayData ?? []).map(a => a.customer_id).filter(Boolean)
  ).size

  // ── Response streak ───────────────────────────────────────────────────────────
  const inboundByDay: Record<string, Set<string>> = {}
  for (const a of inboundLast30d ?? []) {
    const day = (a.created_at as string).split('T')[0]
    if (!inboundByDay[day]) inboundByDay[day] = new Set()
    if (a.customer_id) inboundByDay[day].add(a.customer_id as string)
  }
  const outboundByDay: Record<string, Set<string>> = {}
  for (const a of outboundLast30d ?? []) {
    const day = (a.created_at as string).split('T')[0]
    if (!outboundByDay[day]) outboundByDay[day] = new Set()
    if (a.customer_id) outboundByDay[day].add(a.customer_id as string)
  }

  let responseStreak = 0
  for (let i = 1; i <= 30; i++) {
    const d      = new Date(todayStart.getTime() - i * 86400000)
    const dayStr = d.toISOString().split('T')[0]
    const ins    = inboundByDay[dayStr] ?? new Set<string>()
    const outs   = outboundByDay[dayStr] ?? new Set<string>()
    // No inbound leads that day = streak-safe (nothing to respond to)
    if (ins.size === 0) { responseStreak++; continue }
    const didRespond = [...ins].some(cid => outs.has(cid))
    if (didRespond) responseStreak++
    else break
  }

  // ── Dealer Score ──────────────────────────────────────────────────────────────
  const openLeadsCount      = urgentLeads ?? 0
  const tasksDueTodayCount  = tasksDueToday ?? 0
  const tasksOverdueCount   = tasksOverdue ?? 0
  const tasksDoneTodayCount = tasksDoneToday ?? 0

  // Component 1: Response rate today (30 pts)
  const responseRateScore = openLeadsCount > 0
    ? Math.min(respondedToday / openLeadsCount, 1) * 30
    : 30

  // Component 2: Avg response time (25 pts) — green <5min, yellow <10min, orange <30min
  const responseTimeScore = avgResponseSeconds === null ? 25
    : avgResponseSeconds < 300  ? 25
    : avgResponseSeconds < 600  ? 15
    : avgResponseSeconds < 1800 ? 5
    : 0

  // Component 3: Task completion today (25 pts)
  const totalTasksToday = tasksDueTodayCount + tasksDoneTodayCount
  const taskScore = totalTasksToday > 0
    ? (tasksDoneTodayCount / totalTasksToday) * 25
    : 25

  // Component 4: No overdue tasks (20 pts)
  const overdueScore = tasksOverdueCount === 0 ? 20
    : tasksOverdueCount <= 3    ? 10
    : tasksOverdueCount <= 7    ? 5
    : 0

  const dealerScore = Math.round(responseRateScore + responseTimeScore + taskScore + overdueScore)

  // ── Goals today ───────────────────────────────────────────────────────────────
  const goalsToday = [
    { label: 'Leads responded', target: openLeadsCount,   actual: respondedToday },
    { label: 'Tasks completed', target: tasksDueTodayCount + tasksOverdueCount, actual: tasksDoneTodayCount },
  ].filter(g => g.target > 0)

  // ── Wins this week ────────────────────────────────────────────────────────────
  const sold            = soldThisWeek ?? []
  const winsThisWeek    = sold.length
  const revenueThisWeek = Math.round(sold.reduce((s, v) => s + (Number(v.sold_price) || 0), 0))

  return {
    today: {
      urgent_leads:    urgentLeads ?? 0,
      tasks_due_today: tasksDueTodayCount,
      tasks_overdue:   tasksOverdueCount,
      appt_requests:   apptRequests ?? 0,
    },
    leads: {
      open_leads:           openLeadsCount,
      responded_today:      respondedToday,
      avg_response_seconds: avgResponseSeconds,
    },
    inventory: {
      available_count: availableCount,
      staging_count:   stagingCount ?? 0,
      overpriced,
      at_market:       atMarket,
      underpriced,
      unchecked,
      avg_days:        avgDays,
    },
    bhph: {
      active_loans:  bhphActive.length,
      overdue:       bhphOverdue.length,
      due_this_week: bhphDue7d.length,
      overdue_amount: overdueAmount,
    },
    gamification: {
      dealer_score:          dealerScore,
      response_streak_days:  responseStreak,
      goals_today:           goalsToday,
      wins_this_week:        winsThisWeek,
      revenue_this_week:     revenueThisWeek,
    },
    org_name: orgName,
  }
}
