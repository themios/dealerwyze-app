import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { orgAiAskLimiter } from '@/lib/rateLimit/upstash'
import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UNLIMITED_EMAILS = new Set(['themio@gmail.com'])

// Returns { remaining: 999 } for unlimited users so the client can override localStorage.
// Returns { remaining: null } for everyone else — client uses localStorage as source of truth.
export async function GET() {
  try {
    const profile = await requireProfile()
    if (!canAccessReports(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    const remaining = UNLIMITED_EMAILS.has(user?.email ?? '') ? 999 : null
    return NextResponse.json({ remaining })
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

const BodySchema = z.object({
  question: z.string().min(3).max(500),
})

export async function POST(req: Request) {
  try {
    const profile = await requireProfile()
    if (!canAccessReports(profile.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await assertCanUseFeature(profile.org_id, 'ai_ask')

    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    const unlimited = UNLIMITED_EMAILS.has(user?.email ?? '')

    const { allowed, remaining } = await orgAiAskLimiter(profile.org_id)
    if (!unlimited && !allowed) {
      return NextResponse.json(
        { error: 'You have used all 10 AI questions for today. Try again tomorrow.' },
        { status: 429 },
      )
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const { question } = parsed.data

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

    const supabase = await createClient()

    // Fetch org vertical for prompt branching
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .maybeSingle()
    const isRe = (orgRow?.vertical ?? 'dealer') === 'real_estate'

    const now = Date.now()
    const day = 86400000
    const thirtyDaysAgo = new Date(now - 30 * day).toISOString()

    // Step 1 — fetch all active leads with full intent data
    const { data: leadsRaw } = await supabase
      .from('customers')
      .select('id, name, primary_phone, thread_state, lead_rating, lead_intent_tier, lead_intent_score, lead_source, last_inbound_at, last_outbound_at, next_action_due_at, interested_in, lead_intent_summary, lead_intent_next_action')
      .eq('archived', false)
      .limit(500)
    const leads = leadsRaw ?? []

    // Classify each lead
    const byState: Record<string, number> = {}
    const bySource: Record<string, number> = {}
    const byTier:   Record<string, number> = {}

    type LeadRow = {
      id: string
      name: string
      phone: string
      state: string
      daysSince: number | null
      lastContactDate: string | null
      interestedIn: string
      intentSummary: string
      nextAction: string
      source: string
      dueDate: string | null
    }

    const appointmentsSet: LeadRow[] = []
    const hotNoContact:    LeadRow[] = []
    const coldThisWeek:    LeadRow[] = []
    const overdueFollowUp: LeadRow[] = []

    for (const lead of leads) {
      const state = lead.thread_state ?? 'unknown'
      byState[state] = (byState[state] ?? 0) + 1
      if (lead.lead_source)      bySource[lead.lead_source]      = (bySource[lead.lead_source]      ?? 0) + 1
      if (lead.lead_intent_tier) byTier[lead.lead_intent_tier]   = (byTier[lead.lead_intent_tier]   ?? 0) + 1

      const lastOut = lead.last_outbound_at ? new Date(lead.last_outbound_at).getTime() : null
      const lastIn  = lead.last_inbound_at  ? new Date(lead.last_inbound_at).getTime()  : null
      const lastTs  = Math.max(lastOut ?? 0, lastIn ?? 0)
      const daysSince = lastTs > 0 ? Math.floor((now - lastTs) / day) : null
      const lastContactDate = lastTs > 0 ? new Date(lastTs).toISOString().slice(0, 10) : null

      const row: LeadRow = {
        id: lead.id,
        name: lead.name ?? 'Unknown',
        phone: lead.primary_phone ?? '',
        state,
        daysSince,
        lastContactDate,
        interestedIn: lead.interested_in ?? '',
        intentSummary: lead.lead_intent_summary ?? '',
        nextAction: lead.lead_intent_next_action ?? '',
        source: lead.lead_source ?? '',
        dueDate: lead.next_action_due_at ? lead.next_action_due_at.slice(0, 10) : null,
      }

      if (state === 'appointment_set') {
        appointmentsSet.push(row)
      }
      if ((lead.lead_intent_tier === 'hot' || lead.lead_rating === 'hot') && !lastOut) {
        hotNoContact.push(row)
      }
      if (daysSince !== null && daysSince >= 7 && daysSince <= 21 && state !== 'sold') {
        coldThisWeek.push(row)
      }
      if (lead.next_action_due_at && new Date(lead.next_action_due_at).getTime() < now) {
        overdueFollowUp.push(row)
      }
    }

    // Sort cold leads by most recent first (7 days = freshest opportunity)
    coldThisWeek.sort((a, b) => (a.daysSince ?? 999) - (b.daysSince ?? 999))

    // Step 2 — fetch the last activity body for the top priority leads (max 25)
    const priorityIds = [
      ...appointmentsSet,
      ...hotNoContact,
      ...coldThisWeek,
      ...overdueFollowUp,
    ].slice(0, 25).map(l => l.id)

    const lastActivityByLead: Record<string, string> = {}
    if (priorityIds.length > 0) {
      const { data: recentActsRaw } = await supabase
        .from('activities')
        .select('customer_id, type, direction, body, created_at')
        .in('customer_id', priorityIds)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(200)
      const recentActs = recentActsRaw ?? []

      for (const act of recentActs) {
        if (!lastActivityByLead[act.customer_id]) {
          const snippet = (act.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 150)
          lastActivityByLead[act.customer_id] = `${act.direction ?? ''} ${act.type} — "${snippet}"`
        }
      }
    }

    // Step 3 — aggregate activity summary for the last 30 days
    const { data: allActsRaw } = await supabase
      .from('activities')
      .select('type, direction, created_at')
      .gte('created_at', thirtyDaysAgo)
      .limit(500)
    const allActs = allActsRaw ?? []

    const actByType: Record<string, number> = {}
    let inbound = 0, outbound = 0
    for (const a of allActs) {
      actByType[a.type] = (actByType[a.type] ?? 0) + 1
      if (a.direction === 'inbound')  inbound++
      if (a.direction === 'outbound') outbound++
    }

    // Format a lead block with intent summary + last touch
    function fmtLead(l: LeadRow, rank?: number): string {
      const prefix = rank != null ? `${rank}. ` : '- '
      const lines = [`${prefix}${l.name} | ${l.phone}`]
      if (l.interestedIn)  lines.push(`   ${isRe ? 'Property' : 'Vehicle'}: ${l.interestedIn}`)
      if (l.intentSummary) lines.push(`   Why hot: ${l.intentSummary.split(' • ').slice(0, 3).join(', ')}`)
      if (l.lastContactDate && l.daysSince != null)
        lines.push(`   Last contact: ${l.lastContactDate} (${l.daysSince}d ago)`)
      else
        lines.push(`   Last contact: never`)
      const lastAct = lastActivityByLead[l.id]
      if (lastAct) lines.push(`   Last touch: ${lastAct}`)
      if (l.nextAction) lines.push(`   Suggested next: ${l.nextAction}`)
      if (l.dueDate)    lines.push(`   Follow-up due: ${l.dueDate}`)
      return lines.join('\n')
    }

    function section(title: string, list: LeadRow[], max = 10): string {
      if (list.length === 0) return `${title}: none`
      return `${title} (${list.length} total — top ${Math.min(list.length, max)} shown):\n` +
        list.slice(0, max).map((l, i) => fmtLead(l, i + 1)).join('\n\n')
    }

    const context = `
${isRe ? 'REAL ESTATE BROKERAGE' : 'DEALERSHIP'} CRM SNAPSHOT — ${new Date().toDateString()}
Active ${isRe ? 'prospects' : 'leads'}: ${leads.length}

PIPELINE STAGES:
${Object.entries(byState).sort(([,a],[,b]) => b-a).map(([s,n]) => `  ${s}: ${n}`).join('\n')}

INTENT TIERS:
${Object.entries(byTier).sort(([,a],[,b]) => b-a).map(([t,n]) => `  ${t}: ${n}`).join('\n')}

TOP SOURCES:
${Object.entries(bySource).sort(([,a],[,b]) => b-a).slice(0, 5).map(([s,n]) => `  ${s}: ${n}`).join('\n')}

${section('APPOINTMENTS SET (need confirming/following up)', appointmentsSet)}

${section('HOT LEADS — NEVER CALLED (no outbound yet)', hotNoContact)}

${section('GONE COLD (7-21 days no contact)', coldThisWeek)}

${section('OVERDUE FOLLOW-UPS', overdueFollowUp)}

LAST 30 DAYS: ${allActs.length} activities | ${inbound} inbound | ${outbound} outbound
${Object.entries(actByType).sort(([,a],[,b]) => b-a).map(([t,n]) => `  ${t}: ${n}`).join('\n')}
`.trim()

    const systemPrompt = isRe
      ? `You are a real estate broker reviewing live CRM data. Give the agent a direct, specific answer using only the data below.

HARD RULES:
- Name specific people in every answer. Never say "your leads" or "these contacts."
- Include the phone number so the agent can call immediately.
- For each person, say exactly what to do and what to reference from their history (property interest, last touch, reason they are ready to act).
- Do NOT give generic advice ("follow up with prospects", "build relationships", "utilize sources").
- Do NOT restate numbers or describe the data -- just answer the question.
- If the question is "what to focus on today," output a numbered call list: name, number, one-line why, one-line what to say.`
      : `You are a dealership sales manager reviewing live CRM data. Give the dealer a direct, specific answer using only the data below.

HARD RULES:
- Name specific people in every answer. Never say "your leads" or "these contacts."
- Include the phone number so the dealer can call immediately.
- For each person, say exactly what to do and what to reference from their history (vehicle, last touch, reason they are hot).
- Do NOT give generic advice ("follow up with leads", "build relationships", "utilize sources").
- Do NOT restate numbers or describe the data -- just answer the question.
- If the question is "what to focus on today," output a numbered call list: name, number, one-line why, one-line what to say.`

    const prompt = `${systemPrompt}

${context}

QUESTION: ${question}`

    const groq = new Groq({ apiKey })

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      stream: true,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.enqueue(encoder.encode(`\n\n__REMAINING__:${unlimited ? 999 : remaining - 1}`))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    console.error('[ask] error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
