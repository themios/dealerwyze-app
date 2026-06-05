import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_PER_ORG_PER_WEEK = 50
const MAX_ACTIVITIES = 20

export const FAILURE_MODES = [
  'no_response_first_touch',
  'price_objection_missed',
  'timing_mismatch',
  'wrong_channel',
  'sequence_dropout',
  'objection_unaddressed',
  'competitor_lost',
  'natural_end',
  'unknown',
] as const

export type FailureMode = typeof FAILURE_MODES[number]

export type RootCauseJson = {
  failure_mode: FailureMode
  inflection_activity_index: number
  rep_controllable: boolean
  coaching_note: string
  confidence: number
}

type AuditCandidateRow = {
  id: string
  org_id: string
  customer_id: string
  archived_at: string
}

type ActivityRow = {
  direction: string | null
  type: string
  body: string | null
  created_at: string
  created_by?: string | null
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function weekStartUtcIso(now = new Date()): string {
  // Postgres date_trunc('week', ...) starts on Monday; match that in JS (UTC).
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() // 0=Sun ... 6=Sat
  const delta = (day + 6) % 7 // days since Monday
  d.setUTCDate(d.getUTCDate() - delta)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

function sanitizeBody(body: string | null): string {
  const raw = (body ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  // Best-effort PII redaction: emails + phone-ish patterns.
  const noEmails = raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  const noPhones = noEmails
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
    .slice(0, 1200) // keep prompts bounded
  return noPhones
}

function parseRootCauseJson(raw: string): RootCauseJson | null {
  try {
    const obj = JSON.parse(raw) as Partial<RootCauseJson>
    const failure = typeof obj.failure_mode === 'string' ? obj.failure_mode : ''
    const failure_mode = (FAILURE_MODES as readonly string[]).includes(failure) ? (failure as FailureMode) : null
    if (!failure_mode) return null
    const confidence = clamp01(typeof obj.confidence === 'number' ? obj.confidence : Number.NaN)
    const inflection = typeof obj.inflection_activity_index === 'number'
      ? Math.max(0, Math.min(19, Math.floor(obj.inflection_activity_index)))
      : 0
    const rep_controllable = !!obj.rep_controllable
    const coaching_note = typeof obj.coaching_note === 'string' ? obj.coaching_note.trim().slice(0, 280) : ''
    if (!coaching_note) return null
    return {
      failure_mode,
      inflection_activity_index: inflection,
      rep_controllable,
      coaching_note,
      confidence,
    }
  } catch {
    return null
  }
}

function getSystemPrompt(vertical: 'dealer' | 'real_estate'): string {
  if (vertical === 'real_estate') {
    return [
      'You analyze real estate agent lead conversations and classify why the lead failed.',
      'Output JSON only with keys: failure_mode, inflection_activity_index, rep_controllable, coaching_note, confidence.',
      `failure_mode must be one of: ${FAILURE_MODES.join(' | ')}.`,
      'confidence must be a float 0.00 to 1.00.',
      'coaching_note must be one short sentence (max 25 words) describing the key miss or outcome.',
      'rep_controllable is true only if an agent process or follow-up could reasonably change the outcome.',
      'No PII: do not output any names, phone numbers, emails, or addresses. Refer to roles only (prospect/agent).',
    ].join(' ')
  }

  return [
    'You analyze used-car dealership lead conversations and classify why the lead failed.',
    'Output JSON only with keys: failure_mode, inflection_activity_index, rep_controllable, coaching_note, confidence.',
    `failure_mode must be one of: ${FAILURE_MODES.join(' | ')}.`,
    'confidence must be a float 0.00 to 1.00.',
    'coaching_note must be one short sentence (max 25 words) describing the key miss or outcome.',
    'rep_controllable is true only if a dealership process or follow-up could reasonably change the outcome.',
    'No PII: do not output any names, phone numbers, emails, or addresses. Refer to roles only (customer/dealer).',
  ].join(' ')
}

export async function runRootCauseBatchForOrg(args: {
  supabase?: SupabaseClient
  orgId: string
  maxPerOrgPerWeek?: number
}): Promise<{ attempted: number; written: number; skippedLowActivity: number; budgetRemaining: number }> {
  const supabase = args.supabase ?? createServiceClient()
  const orgId = args.orgId
  const cap = args.maxPerOrgPerWeek ?? MAX_PER_ORG_PER_WEEK

  // Fetch org vertical
  const { data: orgData } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', orgId)
    .maybeSingle()
  const vertical = (orgData?.vertical ?? 'dealer') as 'dealer' | 'real_estate'

  const weekStartIso = weekStartUtcIso()
  const { count: usedThisWeek } = await supabase
    .from('lost_lead_audit')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .not('root_cause_ran_at', 'is', null)
    .gte('root_cause_ran_at', weekStartIso)

  const remaining = Math.max(0, cap - (usedThisWeek ?? 0))
  if (remaining <= 0) {
    return { attempted: 0, written: 0, skippedLowActivity: 0, budgetRemaining: 0 }
  }

  const since = new Date()
  since.setDate(since.getDate() - 7)

  const { data: candidates } = await supabase
    .from('lost_lead_audit')
    .select('id, org_id, customer_id, archived_at')
    .eq('org_id', orgId)
    .is('root_cause_json', null)
    .gte('archived_at', since.toISOString())
    .order('archived_at', { ascending: false })
    .limit(remaining)

  const rows = (candidates ?? []) as AuditCandidateRow[]
  if (rows.length === 0) {
    return { attempted: 0, written: 0, skippedLowActivity: 0, budgetRemaining: remaining }
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.warn('[rootCause] GROQ_API_KEY missing')
    return { attempted: 0, written: 0, skippedLowActivity: 0, budgetRemaining: remaining }
  }

  const { default: Groq } = await import('groq-sdk')
  const groq = new Groq({ apiKey, timeout: 20_000 })

  let attempted = 0
  let written = 0
  let skippedLowActivity = 0

  for (const audit of rows) {
    attempted++

    const { data: activities, error: actErr } = await supabase
      .from('activities')
      .select('direction, type, body, created_at, created_by')
      .eq('user_id', orgId)
      .eq('customer_id', audit.customer_id)
      .order('created_at', { ascending: false })
      .limit(MAX_ACTIVITIES)

    if (actErr) {
      console.warn('[rootCause] activities error:', actErr.message)
      continue
    }

    const acts = (activities ?? []) as ActivityRow[]
    if (acts.length < 3) {
      skippedLowActivity++
      continue
    }

    const chronological = [...acts].reverse().map(a => ({
      ts: a.created_at,
      direction: a.direction ?? 'unknown',
      channel: a.type,
      human: !!a.created_by,
      body: sanitizeBody(a.body),
    })).filter(a => a.body.length > 0)

    if (chronological.length < 3) {
      skippedLowActivity++
      continue
    }

    try {
      const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: 350,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: getSystemPrompt(vertical),
          },
          {
            role: 'user',
            content: `Conversation activities (oldest to newest). Each item: ts, direction, channel, human, body.\n${JSON.stringify(chronological)}`,
          },
        ],
      })

      const usage = completion.usage
      const tokensIn = usage?.prompt_tokens ?? 0
      const tokensOut = usage?.completion_tokens ?? 0
      const raw = completion.choices[0]?.message?.content ?? ''
      const parsed = parseRootCauseJson(raw)

      // Always log AI usage for attempts.
      await supabase.from('ai_usage_log').insert({
        org_id: orgId,
        event_type: 'root_cause_analysis',
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        model: GROQ_MODEL,
      }).then(({ error }) => {
        if (error) console.warn('[rootCause] ai_usage_log failed:', error.message)
      })

      if (!parsed) {
        console.warn('[rootCause] invalid JSON output')
        continue
      }

      const nowIso = new Date().toISOString()
      const needsReview = parsed.confidence < 0.6

      const { error: updErr } = await supabase
        .from('lost_lead_audit')
        .update({
          root_cause_json: parsed as unknown as Record<string, unknown>,
          root_cause_ran_at: nowIso,
          root_cause_confidence: parsed.confidence,
          root_cause_needs_review: needsReview,
        })
        .eq('id', audit.id)
        .eq('org_id', orgId)
        .is('root_cause_json', null)

      if (updErr) {
        console.warn('[rootCause] update failed:', updErr.message)
        continue
      }

      written++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[rootCause] Groq error:', msg)
      // Failure handling: leave fields null so it can retry next week.
      continue
    }
  }

  return { attempted, written, skippedLowActivity, budgetRemaining: Math.max(0, remaining - attempted) }
}

