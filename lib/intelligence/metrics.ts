import { SupabaseClient } from '@supabase/supabase-js'

export interface IntelligencePayload {
  dealer: {
    dealer_name: string
    timezone: string
    report_type: 'daily' | 'weekly' | 'monthly' | 'annual'
    for_date_local: string
  }
  lead_metrics: {
    leads_yesterday: number
    leads_7d_avg: number
    leads_30d_avg: number
    response_time_minutes_target: number
    appointments_set_yesterday: number
    shows_scheduled_next_24h: number
    close_rate_30d: number | null
    lead_sources: Array<{ source: string; leads: number; appointments: number }>
  }
  discipline_metrics: {
    tasks_overdue: number
    tasks_due_today: number
    tasks_completed_yesterday: number
    followup_compliance_rate_yesterday: number | null
  }
  inventory_metrics: {
    inventory_count: number
    avg_days_in_inventory: number | null
    age_buckets: { '0_15': number; '16_30': number; '31_60': number; '60_plus': number }
    slow_movers: Array<{ vehicle_label: string; days_in_inventory: number; leads_last_10d: number; price: number | null }>
    top_performers: Array<{ vehicle_label: string; leads_last_7d: number; price: number | null }>
    pending_units: number
  }
  pricing_margin_metrics: {
    avg_list_price: number | null
    inventory_value_total: number | null
  }
  sales_metrics: {
    units_sold_7d: number
    units_sold_30d: number
    units_sold_mtd: number
    revenue_30d: number | null
    revenue_mtd: number | null
    avg_sale_price_30d: number | null
    avg_discount_30d: number | null      // avg (list price - sold price)
    finance_breakdown_30d: { cash: number; finance: number; bhph: number; unknown: number }
  }
  bhph_metrics: {
    active_loans: number
    total_outstanding: number | null     // sum of (loan_amount - total_paid) for active loans
    monthly_recurring: number | null     // sum of monthly_payment for active loans
    overdue_accounts: number             // next_due_date < today
    overdue_amount: number | null        // sum of monthly_payment for overdue accounts
    due_next_7d: number                  // next_due_date within next 7 days
    defaulted_accounts: number
    paid_off_accounts: number
  }
  goals: {
    today: Array<{ metric: string; target: string; why: string }>
    weekly: Array<{ metric: string; target: string; why: string }>
    monthly: Array<{ metric: string; target: string; why: string }>
    annual: Array<{ metric: string; target: string; why: string }>
  }
  market_signals: {
    enabled: boolean
    signals: Array<{ headline: string; source: string; url: string }>
  }
  salesperson_performance: {
    leads_yesterday: number
    leads_responded_yesterday: number
    response_rate_yesterday: number | null
    lead_to_appt_rate_yesterday: number | null
    outbound_touches_yesterday: number
    avg_touches_per_responded_lead: number | null
  }
  twilio_metrics: {
    messages_mtd: number
    quota: number
    quota_pct: number
    avg_response_time_minutes: number | null
    ghost_rate_pct: number | null
    messages_per_sold_lead: number | null
    mms_count: number
    overage_forecast_day: number | null  // projected day quota will be exceeded
  }
}

function vehicleLabel(v: { year: number; make: string; model: string; trim?: string | null }): string {
  return `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function detectSource(body: string): string {
  const lower = (body ?? '').toLowerCase()
  if (lower.includes('autotrader')) return 'autotrader'
  if (lower.includes('cargurus')) return 'cargurus'
  if (lower.includes('cars.com')) return 'cars_com'
  if (lower.includes('facebook')) return 'facebook'
  if (lower.includes('carfax')) return 'carfax'
  if (lower.includes('truecar')) return 'truecar'
  return 'direct_email'
}

export async function computePayload(
  supabase: SupabaseClient,
  orgId: string,
  dealerName: string,
  forDate: string,
  signals: Array<{ headline: string; source: string; url: string }> = []
): Promise<IntelligencePayload> {
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const yesterdayEnd = new Date(todayStart.getTime() - 1)
  const day7ago = new Date(now.getTime() - 7 * 86400000)
  const day10ago = new Date(now.getTime() - 10 * 86400000)
  const day30ago = new Date(now.getTime() - 30 * 86400000)
  const todayEnd = new Date(todayStart); todayEnd.setHours(23, 59, 59, 999)
  const next24h = new Date(now.getTime() + 86400000)
  const next7d = new Date(now.getTime() + 7 * 86400000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Run ALL queries in parallel
  const [
    { data: leadsYesterday },
    { data: leads7d },
    { data: leads30d },
    { data: apptsYesterday },
    { data: upcomingAppts },
    { data: overdueTasks },
    { data: todayTasks },
    { data: completedYesterday },
    { data: vehicles },
    { data: leadActs10d },
    { data: leadActs7d },
    { data: goalsData },
    { data: outboundYesterday },
    { data: soldVehicles30d },
    { data: bhphPortfolio },
    { data: pendingVehicles },
    { data: smsActivitiesMTD },
    { data: orgQuota },
  ] = await Promise.all([
    supabase.from('activities').select('id,body,customer_id').eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound').gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('activities').select('id').eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound').gte('created_at', day7ago.toISOString()),
    supabase.from('activities').select('id,outcome').eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound').gte('created_at', day30ago.toISOString()),
    supabase.from('activities').select('id').eq('user_id', orgId).eq('type', 'appointment').gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('activities').select('id').eq('user_id', orgId).eq('type', 'appointment').is('completed_at', null).gte('due_at', now.toISOString()).lte('due_at', next24h.toISOString()),
    supabase.from('activities').select('id').eq('user_id', orgId).in('type', ['task', 'call', 'sms', 'email']).is('completed_at', null).lt('due_at', now.toISOString()).not('due_at', 'is', null),
    supabase.from('activities').select('id').eq('user_id', orgId).in('type', ['task', 'call', 'sms', 'email']).is('completed_at', null).gte('due_at', todayStart.toISOString()).lte('due_at', todayEnd.toISOString()),
    supabase.from('activities').select('id').eq('user_id', orgId).in('type', ['task', 'call', 'sms', 'email']).not('completed_at', 'is', null).gte('completed_at', yesterdayStart.toISOString()).lte('completed_at', yesterdayEnd.toISOString()),
    supabase.from('vehicles').select('id,year,make,model,trim,price,created_at').eq('user_id', orgId).eq('status', 'available'),
    supabase.from('activities').select('vehicle_id').eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound').gte('created_at', day10ago.toISOString()).not('vehicle_id', 'is', null),
    supabase.from('activities').select('vehicle_id').eq('user_id', orgId).eq('type', 'email').eq('direction', 'inbound').gte('created_at', day7ago.toISOString()).not('vehicle_id', 'is', null),
    supabase.from('dealer_goals').select('period,metric,target,why').eq('org_id', orgId).order('sort_order'),
    supabase.from('activities').select('customer_id').eq('user_id', orgId).in('type', ['call', 'sms', 'email']).eq('direction', 'outbound').gte('created_at', yesterdayStart.toISOString()).lte('created_at', yesterdayEnd.toISOString()),
    supabase.from('vehicles').select('id,sold_price,price,sold_at,finance_type').eq('user_id', orgId).eq('status', 'sold').gte('sold_at', day30ago.toISOString()).not('sold_at', 'is', null),
    supabase.from('bhph_payments').select('id,loan_amount,total_paid,monthly_payment,next_due_date,status,down_payment').eq('user_id', orgId),
    supabase.from('vehicles').select('id').eq('user_id', orgId).eq('status', 'pending'),
    supabase.from('activities').select('id,direction,customer_id,created_at').eq('user_id', orgId).eq('type', 'sms').gte('created_at', monthStart.toISOString()),
    supabase.from('organizations').select('monthly_message_count, monthly_mms_count, sms_quota, billing_cycle_start').eq('id', orgId).single(),
  ])

  // --- Lead metrics ---
  const leadsYestCount = leadsYesterday?.length ?? 0
  const leads7dAvg = Math.round(((leads7d?.length ?? 0) / 7) * 10) / 10
  const leads30dAvg = Math.round(((leads30d?.length ?? 0) / 30) * 10) / 10
  const closed30d = leads30d?.filter(l => l.outcome === 'answered').length ?? 0
  const closeRate30d = (leads30d?.length ?? 0) > 0 ? Math.round(closed30d / leads30d!.length * 100) / 100 : null

  const sourceMap: Record<string, number> = {}
  for (const l of leadsYesterday ?? []) {
    const src = detectSource(l.body ?? '')
    sourceMap[src] = (sourceMap[src] ?? 0) + 1
  }
  const leadSources = Object.entries(sourceMap).map(([source, leads]) => ({ source, leads, appointments: 0 }))

  // --- Discipline ---
  const tasksOverdue = overdueTasks?.length ?? 0
  const tasksDueToday = todayTasks?.length ?? 0
  const tasksCompleted = completedYesterday?.length ?? 0
  const totalDue = tasksCompleted + tasksOverdue
  const followupCompliance = totalDue > 0 ? Math.round(tasksCompleted / totalDue * 100) / 100 : null

  // --- Inventory ---
  const inventoryCount = vehicles?.length ?? 0
  const buckets = { '0_15': 0, '16_30': 0, '31_60': 0, '60_plus': 0 }
  let totalDays = 0
  for (const v of vehicles ?? []) {
    const d = daysSince(v.created_at)
    totalDays += d
    if (d <= 15) buckets['0_15']++
    else if (d <= 30) buckets['16_30']++
    else if (d <= 60) buckets['31_60']++
    else buckets['60_plus']++
  }
  const avgDaysInInventory = inventoryCount > 0 ? Math.round(totalDays / inventoryCount) : null

  const vlc10d: Record<string, number> = {}
  for (const a of leadActs10d ?? []) { if (a.vehicle_id) vlc10d[a.vehicle_id] = (vlc10d[a.vehicle_id] ?? 0) + 1 }

  const vlc7d: Record<string, number> = {}
  for (const a of leadActs7d ?? []) { if (a.vehicle_id) vlc7d[a.vehicle_id] = (vlc7d[a.vehicle_id] ?? 0) + 1 }

  const slowMovers = (vehicles ?? [])
    .map(v => ({ vehicle_label: vehicleLabel(v), days_in_inventory: daysSince(v.created_at), leads_last_10d: vlc10d[v.id] ?? 0, price: v.price ? Number(v.price) : null }))
    .filter(v => v.days_in_inventory > 20)
    .sort((a, b) => a.leads_last_10d - b.leads_last_10d || b.days_in_inventory - a.days_in_inventory)
    .slice(0, 4)

  const topPerformers = (vehicles ?? [])
    .map(v => ({ vehicle_label: vehicleLabel(v), leads_last_7d: vlc7d[v.id] ?? 0, price: v.price ? Number(v.price) : null }))
    .filter(v => v.leads_last_7d > 0)
    .sort((a, b) => b.leads_last_7d - a.leads_last_7d)
    .slice(0, 3)

  const prices = (vehicles ?? []).map(v => Number(v.price)).filter(p => p > 0)
  const avgListPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null
  const inventoryValueTotal = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0)) : null

  // --- Sales metrics ---
  const sold7d = (soldVehicles30d ?? []).filter(v => new Date(v.sold_at) >= day7ago)
  const soldMTD = (soldVehicles30d ?? []).filter(v => new Date(v.sold_at) >= monthStart)
  const sold30d = soldVehicles30d ?? []

  const revenue30d = sold30d.length > 0
    ? Math.round(sold30d.reduce((s, v) => s + (Number(v.sold_price) || 0), 0))
    : null
  const revenueMTD = soldMTD.length > 0
    ? Math.round(soldMTD.reduce((s, v) => s + (Number(v.sold_price) || 0), 0))
    : null

  const soldWithPrice = sold30d.filter(v => v.sold_price && Number(v.sold_price) > 0)
  const avgSalePrice30d = soldWithPrice.length > 0
    ? Math.round(soldWithPrice.reduce((s, v) => s + Number(v.sold_price), 0) / soldWithPrice.length)
    : null

  const soldWithBothPrices = sold30d.filter(v => v.sold_price && v.price && Number(v.sold_price) > 0 && Number(v.price) > 0)
  const avgDiscount30d = soldWithBothPrices.length > 0
    ? Math.round(soldWithBothPrices.reduce((s, v) => s + (Number(v.price) - Number(v.sold_price)), 0) / soldWithBothPrices.length)
    : null

  const finBreakdown = { cash: 0, finance: 0, bhph: 0, unknown: 0 }
  for (const v of sold30d) {
    const ft = (v.finance_type ?? 'unknown') as keyof typeof finBreakdown
    if (ft in finBreakdown) finBreakdown[ft]++
    else finBreakdown.unknown++
  }

  // --- BHPH metrics ---
  const bhph = bhphPortfolio ?? []
  const bhphActive = bhph.filter(b => b.status === 'active')
  const bhphDefaulted = bhph.filter(b => b.status === 'defaulted')
  const bhphPaidOff = bhph.filter(b => b.status === 'paid_off')

  const totalOutstanding = bhphActive.length > 0
    ? Math.round(bhphActive.reduce((s, b) => s + Math.max(0, (Number(b.loan_amount) || 0) - (Number(b.total_paid) || 0)), 0))
    : null
  const monthlyRecurring = bhphActive.length > 0
    ? Math.round(bhphActive.reduce((s, b) => s + (Number(b.monthly_payment) || 0), 0))
    : null

  const today = todayStart
  const overdueAccounts = bhphActive.filter(b => b.next_due_date && new Date(b.next_due_date) < today)
  const overdueAmount = overdueAccounts.length > 0
    ? Math.round(overdueAccounts.reduce((s, b) => s + (Number(b.monthly_payment) || 0), 0))
    : null
  const dueNext7d = bhphActive.filter(b => {
    if (!b.next_due_date) return false
    const d = new Date(b.next_due_date)
    return d >= today && d <= next7d
  }).length

  // --- Salesperson performance ---
  const leadCustomerIds = new Set((leadsYesterday ?? []).map(l => l.customer_id).filter(Boolean))
  const respondedCustomerIds = new Set(
    (outboundYesterday ?? []).map(a => a.customer_id).filter(id => leadCustomerIds.has(id))
  )
  const leadsRespondedYesterday = respondedCustomerIds.size
  const responseRate = leadsYestCount > 0 ? Math.round(leadsRespondedYesterday / leadsYestCount * 100) / 100 : null
  const leadToApptRate = leadsYestCount > 0 ? Math.round((apptsYesterday?.length ?? 0) / leadsYestCount * 100) / 100 : null
  const outboundTouches = outboundYesterday?.length ?? 0
  const avgTouchesPerLead = leadsRespondedYesterday > 0
    ? Math.round((outboundTouches / leadsRespondedYesterday) * 10) / 10
    : null

  // --- Goals ---
  const goals = {
    today: [] as Array<{ metric: string; target: string; why: string }>,
    weekly: [] as Array<{ metric: string; target: string; why: string }>,
    monthly: [] as Array<{ metric: string; target: string; why: string }>,
    annual: [] as Array<{ metric: string; target: string; why: string }>,
  }
  for (const g of goalsData ?? []) {
    const k = g.period as keyof typeof goals
    if (goals[k]) goals[k].push({ metric: g.metric, target: g.target, why: g.why ?? '' })
  }

  // --- Twilio metrics ---
  const smsActivities = smsActivitiesMTD ?? []
  const messagesMTD = smsActivities.length

  const quota = orgQuota?.sms_quota ?? 1000
  const mmsCount = orgQuota?.monthly_mms_count ?? 0
  const quotaPct = quota > 0 ? Math.round((messagesMTD / quota) * 100) : 0

  // avg response time: for each inbound, find the next outbound to same customer
  const inbound30d = smsActivities.filter(a => a.direction === 'inbound' && a.customer_id)
  const outbound30d = smsActivities.filter(a => a.direction === 'outbound' && a.customer_id)

  // Group outbound by customer_id for quick lookup
  const outboundByCustomer: Record<string, Array<{ created_at: string }>> = {}
  for (const a of outbound30d) {
    if (!a.customer_id) continue
    if (!outboundByCustomer[a.customer_id]) outboundByCustomer[a.customer_id] = []
    outboundByCustomer[a.customer_id].push({ created_at: a.created_at })
  }

  const responseTimes: number[] = []
  for (const inMsg of inbound30d) {
    const cid = inMsg.customer_id
    if (!cid) continue
    const inboundTime = new Date(inMsg.created_at).getTime()
    const replies = (outboundByCustomer[cid] ?? [])
      .map(o => new Date(o.created_at).getTime())
      .filter(t => t > inboundTime)
      .sort((a, b) => a - b)
    if (replies.length > 0) {
      responseTimes.push((replies[0] - inboundTime) / 60000)
    }
  }
  const avgResponseTimeMinutes = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null

  // ghost rate: customers who sent inbound SMS but never got a reply this month
  const customersWithInbound = new Set(inbound30d.map(a => a.customer_id).filter(Boolean))
  const customersWithOutbound = new Set(outbound30d.map(a => a.customer_id).filter(Boolean))
  const ghosted = [...customersWithInbound].filter(cid => !customersWithOutbound.has(cid))
  const ghostRatePct = customersWithInbound.size > 0
    ? Math.round((ghosted.length / customersWithInbound.size) * 100)
    : null

  // messages per sold lead
  const unitsSoldMTD = soldMTD.length
  const messagesPerSoldLead = messagesMTD > 0
    ? Math.round((messagesMTD / Math.max(unitsSoldMTD, 1)) * 10) / 10
    : null

  // overage forecast day: if burn rate > 0, project when quota is hit
  let overageForecastDay: number | null = null
  const cycleStartStr = orgQuota?.billing_cycle_start
  if (messagesMTD > 0 && cycleStartStr) {
    const cycleStart = new Date(cycleStartStr)
    const daysIntoCycle = Math.max(1, Math.floor((now.getTime() - cycleStart.getTime()) / 86400000))
    const burnPerDay = messagesMTD / daysIntoCycle
    if (burnPerDay > 0 && messagesMTD < quota) {
      overageForecastDay = Math.ceil(daysIntoCycle + (quota - messagesMTD) / burnPerDay)
    }
  }

  return {
    dealer: { dealer_name: dealerName, timezone: 'America/Los_Angeles', report_type: 'daily', for_date_local: forDate },
    lead_metrics: { leads_yesterday: leadsYestCount, leads_7d_avg: leads7dAvg, leads_30d_avg: leads30dAvg, response_time_minutes_target: 5, appointments_set_yesterday: apptsYesterday?.length ?? 0, shows_scheduled_next_24h: upcomingAppts?.length ?? 0, close_rate_30d: closeRate30d, lead_sources: leadSources },
    discipline_metrics: { tasks_overdue: tasksOverdue, tasks_due_today: tasksDueToday, tasks_completed_yesterday: tasksCompleted, followup_compliance_rate_yesterday: followupCompliance },
    inventory_metrics: { inventory_count: inventoryCount, avg_days_in_inventory: avgDaysInInventory, age_buckets: buckets, slow_movers: slowMovers, top_performers: topPerformers, pending_units: pendingVehicles?.length ?? 0 },
    pricing_margin_metrics: { avg_list_price: avgListPrice, inventory_value_total: inventoryValueTotal },
    sales_metrics: { units_sold_7d: sold7d.length, units_sold_30d: sold30d.length, units_sold_mtd: soldMTD.length, revenue_30d: revenue30d, revenue_mtd: revenueMTD, avg_sale_price_30d: avgSalePrice30d, avg_discount_30d: avgDiscount30d, finance_breakdown_30d: finBreakdown },
    bhph_metrics: { active_loans: bhphActive.length, total_outstanding: totalOutstanding, monthly_recurring: monthlyRecurring, overdue_accounts: overdueAccounts.length, overdue_amount: overdueAmount, due_next_7d: dueNext7d, defaulted_accounts: bhphDefaulted.length, paid_off_accounts: bhphPaidOff.length },
    goals,
    market_signals: { enabled: signals.length > 0, signals },
    salesperson_performance: { leads_yesterday: leadsYestCount, leads_responded_yesterday: leadsRespondedYesterday, response_rate_yesterday: responseRate, lead_to_appt_rate_yesterday: leadToApptRate, outbound_touches_yesterday: outboundTouches, avg_touches_per_responded_lead: avgTouchesPerLead },
    twilio_metrics: { messages_mtd: messagesMTD, quota, quota_pct: quotaPct, avg_response_time_minutes: avgResponseTimeMinutes, ghost_rate_pct: ghostRatePct, messages_per_sold_lead: messagesPerSoldLead, mms_count: mmsCount, overage_forecast_day: overageForecastDay },
  }
}
