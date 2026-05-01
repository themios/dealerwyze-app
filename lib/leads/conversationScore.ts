import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { refreshCustomerEngagement } from '@/lib/customers/engagement'
import {
  deriveLeadIntentTier,
  type LeadIntentFlag,
  normalizeLeadIntentFlags,
} from '@/lib/leads/intent'

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const MAX_TRANSCRIPT_CHARS = 12_000
const MAX_ACTIVITIES = 40
const MAX_TRIGGERED_SCORES_PER_ORG_PER_DAY = 50
const LOCK_MS = 90_000
const DEBOUNCE_MS_WARM = 30_000
const DEBOUNCE_MS_DEFAULT = 120_000

export type ConversationScoreTrigger = 'ingest' | 'inbound_sms' | 'inbound_email' | 'batch'

function nextActionForDb(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : ''
  const ok = ['call_now', 'text_now', 'send_financing_link', 'confirm_appointment', 'send_followup', 'wait'] as const
  return (ok as readonly string[]).includes(s) ? s : null
}

type ActivityRow = {
  id: string
  type: string
  direction: string | null
  body: string | null
  created_at: string
}

type CustomerScoreRow = {
  id: string
  user_id: string
  primary_phone: string | null
  secondary_phone: string | null
  email: string | null
  lead_intent_tier: string | null
  lead_intent_scored_at: string | null
  lead_intent_input_hash: string | null
  lead_intent_manual_tier: string | null
  lead_intent_manual_expires_at: string | null
}

export interface ConversationScoreResult {
  score01: number
  score100: number
  tier: ReturnType<typeof deriveLeadIntentTier>
  flags: LeadIntentFlag[]
  summary: string
  rawFlags: string[]
}

interface LlmRaw {
  score?: number
  tier?: string
  flags?: string[]
  summary?: string
  next_best_action?: string
}

const LLM_FLAG_TO_INTENT: Record<string, LeadIntentFlag | undefined> = {
  appointment_request: 'appointment',
  test_drive: 'appointment',
  financing_interest: 'warm_shopper',
  trade_in: 'warm_shopper',
  urgency_signal: 'warm_shopper',
  price_sensitive: 'warm_shopper',
  competitive_mention: 'warm_shopper',
  repeat_inquiry: 'repeat_inquiry',
  returning_customer: 'returning_shopper',
  reliability_concern: 'warm_shopper',
  specific_vehicle: 'local_shopper',
  general_inquiry: 'warm_shopper',
  cash_buyer: 'warm_shopper',
}

export function hashTranscript(transcript: string): string {
  return createHash('sha256').update(transcript, 'utf8').digest('hex')
}

export function buildTranscriptLines(activities: ActivityRow[]): string {
  const chronological = [...activities].reverse()
  const lines: string[] = []
  for (const a of chronological) {
    const role =
      a.direction === 'inbound' ? 'customer' :
      a.direction === 'outbound' ? 'dealer' : 'note'
    const prefix = a.type === 'call' ? `[${role}|call]` : `[${role}|${a.type}]`
    const body = (a.body ?? '').replace(/\s+/g, ' ').trim()
    if (!body) continue
    lines.push(`${prefix}: ${body}`)
  }
  let text = lines.join('\n')
  if (text.length > MAX_TRANSCRIPT_CHARS) {
    text = text.slice(text.length - MAX_TRANSCRIPT_CHARS)
  }
  return text
}

export function mapLlmFlagsToLeadFlags(llmFlags: string[]): LeadIntentFlag[] {
  const out = new Set<LeadIntentFlag>()
  for (const f of llmFlags) {
    const mapped = LLM_FLAG_TO_INTENT[f]
    if (mapped) out.add(mapped)
  }
  return normalizeLeadIntentFlags([...out])
}

/** Apply post-LLM rules; `score01` is 0..1 before tier mapping. */
export function normalizeConversationScore(args: {
  score01: number
  llmFlags: string[]
  hasPhone: boolean
  hasEmail: boolean
  isReinquiry: boolean
}): ConversationScoreResult {
  let score01 = clamp(args.score01, 0, 1)

  if (args.isReinquiry) {
    score01 = Math.min(1, score01 + 0.2)
  }

  const flags = mapLlmFlagsToLeadFlags(args.llmFlags)
  const rawLower = args.llmFlags.map(f => f.toLowerCase())
  if (
    rawLower.some(f => f.includes('appointment') || f.includes('test_drive'))
  ) {
    // Align with deriveLeadIntentTier: hot begins at score 80 (0.80 on 0–1 scale)
    score01 = Math.max(score01, 0.8)
  }

  if (!args.hasPhone && !args.hasEmail) {
    score01 = Math.min(score01, 0.24)
  }

  const score100 = Math.round(score01 * 100)
  const tier = deriveLeadIntentTier(score100)

  const summaryParts: string[] = []
  if (flags.includes('appointment')) summaryParts.push('Appointment or visit intent')
  if (flags.includes('repeat_inquiry')) summaryParts.push('Repeat inquiry')
  if (flags.includes('returning_shopper')) summaryParts.push('Returning customer')
  if (flags.includes('warm_shopper')) summaryParts.push('Strong buying signals')
  const summary = summaryParts.length > 0
    ? summaryParts.join(' · ').slice(0, 280)
    : 'Follow up based on latest conversation'

  return {
    score01,
    score100,
    tier,
    flags,
    summary,
    rawFlags: args.llmFlags,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function parseLlmJson(content: string): LlmRaw | null {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(content.slice(start, end + 1)) as LlmRaw
  } catch {
    return null
  }
}

async function acquireLock(
  supabase: SupabaseClient,
  customerId: string,
): Promise<boolean> {
  const now = new Date().toISOString()
  const newUntil = new Date(Date.now() + LOCK_MS).toISOString()
  // Atomic: UPDATE only succeeds if no active lock exists. Prevents TOCTOU race
  // between concurrent inbound webhook + batch cron scoring the same customer.
  const { data, error } = await supabase
    .from('customers')
    .update({ conversation_score_locked_until: newUntil })
    .eq('id', customerId)
    .or(`conversation_score_locked_until.is.null,conversation_score_locked_until.lt.${now}`)
    .select('id')

  if (error) {
    console.warn('[conversationScore] lock error:', error.message)
    return false
  }
  return Array.isArray(data) && data.length > 0
}

async function releaseLock(supabase: SupabaseClient, customerId: string): Promise<void> {
  await supabase
    .from('customers')
    .update({ conversation_score_locked_until: null })
    .eq('id', customerId)
}

async function countTriggeredToday(supabase: SupabaseClient, orgId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10)
  const { count, error } = await supabase
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('log_date', day)
    .eq('event_type', 'triggered_score')

  if (error) {
    console.warn('[conversationScore] usage count error:', error.message)
    return 0
  }
  return count ?? 0
}

async function logUsage(
  supabase: SupabaseClient,
  orgId: string,
  eventType: string,
  tokensIn: number,
  tokensOut: number,
  model: string,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  await supabase.from('ai_usage_log').insert({
    org_id: orgId,
    log_date: day,
    event_type: eventType,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    model,
  })
}

function debounceMsForTier(tier: string | null): number {
  if (tier === 'hot' || tier === 'warm') return DEBOUNCE_MS_WARM
  return DEBOUNCE_MS_DEFAULT
}

/**
 * Scores a customer from recent SMS/email/call activities via Groq. Uses service role.
 * Safe to call from webhooks: failures are logged, never thrown to caller when using enqueue helper.
 */
export async function scoreCustomerConversation(args: {
  customerId: string
  orgId: string
  trigger: ConversationScoreTrigger
  force?: boolean
}): Promise<{ ok: boolean; skipped?: string }> {
  const { customerId, orgId, trigger, force = false } = args
  const isBatch = trigger === 'batch'
  const supabase = createServiceClient()

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select(
      'id, user_id, primary_phone, secondary_phone, email, lead_intent_tier, lead_intent_scored_at, lead_intent_input_hash, lead_intent_manual_tier, lead_intent_manual_expires_at',
    )
    .eq('id', customerId)
    .maybeSingle()

  if (custErr || !customer) {
    console.warn('[conversationScore] customer load failed:', custErr?.message)
    return { ok: false, skipped: 'no_customer' }
  }

  const row = customer as CustomerScoreRow
  if (row.user_id !== orgId) {
    console.warn('[conversationScore] org mismatch for customer', customerId)
    return { ok: false, skipped: 'org_mismatch' }
  }

  const now = Date.now()
  if (row.lead_intent_manual_tier && row.lead_intent_manual_expires_at) {
    const exp = new Date(row.lead_intent_manual_expires_at).getTime()
    if (!Number.isNaN(exp) && exp < now) {
      await supabase
        .from('customers')
        .update({
          lead_intent_manual_tier: null,
          lead_intent_manual_expires_at: null,
        })
        .eq('id', customerId)
      row.lead_intent_manual_tier = null
      row.lead_intent_manual_expires_at = null
    }
  }

  const bypassCap = force && trigger === 'ingest'
  if (!isBatch && !bypassCap) {
    const n = await countTriggeredToday(supabase, orgId)
    if (n >= MAX_TRIGGERED_SCORES_PER_ORG_PER_DAY) {
      return { ok: true, skipped: 'org_daily_cap' }
    }
  }

  const scoredAt = row.lead_intent_scored_at ? new Date(row.lead_intent_scored_at).getTime() : 0
  if (!isBatch && !force && scoredAt > 0) {
    const debounce = debounceMsForTier(row.lead_intent_tier)
    if (now - scoredAt < debounce) {
      return { ok: true, skipped: 'debounce' }
    }
  }

  const locked = await acquireLock(supabase, customerId)
  if (!locked) {
    return { ok: true, skipped: 'locked' }
  }

  try {
    const { data: acts, error: actErr } = await supabase
      .from('activities')
      .select('id, type, direction, body, created_at')
      .eq('customer_id', customerId)
      .in('type', ['sms', 'email', 'call'])
      .order('created_at', { ascending: false })
      .limit(MAX_ACTIVITIES)

    if (actErr) {
      console.warn('[conversationScore] activities error:', actErr.message)
      return { ok: false, skipped: 'activities_error' }
    }

    const transcript = buildTranscriptLines((acts ?? []) as ActivityRow[])
    if (!transcript.trim()) {
      return { ok: true, skipped: 'empty_transcript' }
    }

    const inputHash = hashTranscript(transcript)
    if (inputHash === row.lead_intent_input_hash) {
      return { ok: true, skipped: 'same_hash' }
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      console.warn('[conversationScore] GROQ_API_KEY missing')
      return { ok: false, skipped: 'no_api_key' }
    }

    const { count: inboundCount, error: inboundErr } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')

    if (inboundErr) console.warn('[conversationScore] inboundCount error:', inboundErr.message)
    const isReinquiry = (inboundCount ?? 0) >= 2

    const { default: Groq } = await import('groq-sdk')
    const groq = new Groq({ apiKey, timeout: 20_000 })

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 350,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You score used-car dealership leads. Output JSON only with keys: score (0-1 float), tier (ignore your tier—we recompute), flags (string array from: financing_interest, trade_in, appointment_request, test_drive, urgency_signal, price_sensitive, competitive_mention, repeat_inquiry, cash_buyer, returning_customer, reliability_concern, specific_vehicle, general_inquiry), summary (one short sentence), next_best_action (call_now|text_now|send_financing_link|confirm_appointment|send_followup|wait).`,
        },
        {
          role: 'user',
          content: `Conversation (most recent at bottom may be truncated):\n${transcript}`,
        },
      ],
    })

    const rawText = completion.choices[0]?.message?.content ?? ''
    const parsed = parseLlmJson(rawText)
    if (!parsed || typeof parsed.score !== 'number') {
      throw new Error('invalid_llm_json')
    }

    const usage = completion.usage
    const tokensIn = usage?.prompt_tokens ?? 0
    const tokensOut = usage?.completion_tokens ?? 0

    await logUsage(supabase, orgId, isBatch ? 'batch_score' : 'triggered_score', tokensIn, tokensOut, GROQ_MODEL)

    const hasPhone = !!row.primary_phone?.trim() || !!row.secondary_phone?.trim()
    const hasEmail = !!row.email?.trim()

    const normalized = normalizeConversationScore({
      score01: parsed.score,
      llmFlags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
      hasPhone,
      hasEmail,
      isReinquiry,
    })

    const summaryText = (parsed.summary && parsed.summary.trim())
      ? parsed.summary.trim().slice(0, 280)
      : normalized.summary

    const nextAction = nextActionForDb(parsed.next_best_action)

    await supabase
      .from('customers')
      .update({
        lead_intent_score: normalized.score100,
        lead_intent_tier: normalized.tier,
        lead_intent_flags: normalized.flags,
        lead_intent_summary: summaryText,
        lead_intent_next_action: nextAction,
        lead_intent_source: 'conversation_llm',
        lead_intent_updated_at: new Date().toISOString(),
        lead_intent_scored_at: new Date().toISOString(),
        lead_intent_input_hash: inputHash,
        lead_intent_score_error: false,
        lead_intent_score_failures: 0,
      })
      .eq('id', customerId)

    void refreshCustomerEngagement(supabase, customerId)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[conversationScore] error:', msg)

    await logUsage(supabase, orgId, 'score_error', 0, 0, GROQ_MODEL).catch(() => {})

    const { data: failRow } = await supabase
      .from('customers')
      .select('lead_intent_score_failures')
      .eq('id', customerId)
      .maybeSingle()

    const prev = (failRow as { lead_intent_score_failures?: number } | null)?.lead_intent_score_failures ?? 0
    const nextFails = prev + 1

    await supabase
      .from('customers')
      .update({
        lead_intent_score_failures: nextFails,
        lead_intent_score_error: nextFails >= 3,
      })
      .eq('id', customerId)

    return { ok: false, skipped: 'llm_error' }
  } finally {
    await releaseLock(supabase, customerId)
  }
}

/**
 * Fire-and-forget rescoring. Never throws.
 */
/**
 * Batch re-score customers stale for 72h+ (nightly cap per org via limit).
 */
export async function batchRescoreStaleForOrg(orgId: string, limit = 25): Promise<number> {
  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  const { data: rows } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', orgId)
    .is('merged_at', null)
    .or(`lead_intent_scored_at.is.null,lead_intent_scored_at.lt.${cutoff}`)
    .limit(limit)

  let n = 0
  for (const r of rows ?? []) {
    const res = await scoreCustomerConversation({
      customerId: r.id as string,
      orgId,
      trigger: 'batch',
    })
    if (res.ok && !res.skipped) n++
  }
  return n
}

export function enqueueConversationRescore(args: {
  customerId: string
  orgId: string
  trigger: ConversationScoreTrigger
  force?: boolean
}): void {
  void scoreCustomerConversation(args).then(res => {
    if (res.skipped && res.skipped !== 'debounce' && res.skipped !== 'same_hash' && res.skipped !== 'locked') {
      /* only log interesting skips in dev */
      if (process.env.NODE_ENV === 'development') {
        console.info('[conversationScore] skipped:', res.skipped, args.customerId)
      }
    }
  }).catch(err => {
    console.error('[conversationScore] unhandled:', err)
  })
}
