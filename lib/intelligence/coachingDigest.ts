import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import type { RootCauseJson, FailureMode } from '@/lib/intelligence/rootCause'

type MessagingPatternsCache = {
  responseTimeBuckets?: Array<{ hour: number; sampleSize: number; replyRate: number }>
  messageLengthBuckets?: Array<{ bucket: string; sampleSize: number; replyRate: number }>
  firstTouchPhrases?: Array<{ phrase: string; sampleSize: number; replyRate: number }>
  sequenceStepDropoff?: Array<{ sequenceId: string; sequenceName: string; stepNumber: number; sampleSize: number; silenceRate: number }>
  channelEffectiveness?: Array<{ channel: string; intentTier: string; sampleSize: number; replyRate: number }>
}

type OrgPerformanceCache = {
  messagingPatterns?: MessagingPatternsCache
  generatedAt?: string
}

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h >= 12 ? 'pm' : 'am'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${suffix}`
}

function ensureSample10<T extends { sampleSize: number }>(items: T[] | null | undefined): T[] {
  return (items ?? []).filter(i => (i.sampleSize ?? 0) >= 10)
}

function mostCommon<T extends string>(values: T[]): { value: T | null; count: number } {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: { value: T | null; count: number } = { value: null, count: 0 }
  for (const [value, count] of counts.entries()) {
    if (count > best.count) best = { value, count }
  }
  return best
}

async function computeTeamReplyRate(args: { supabase: SupabaseClient; orgId: string; fromIso: string; toIso: string }) {
  const { data: rows } = await args.supabase
    .from('v_rep_reply_rates')
    .select('got_reply, outbound_at')
    .eq('org_id', args.orgId)
    .gte('outbound_at', args.fromIso)
    .lte('outbound_at', args.toIso)

  const list = (rows ?? []) as Array<{ got_reply?: boolean | null }>
  const total = list.length
  const replied = list.filter(r => !!r.got_reply).length
  const rate = total > 0 ? Math.round((replied / total) * 100) : 0
  return { total, replied, rate }
}

async function resolveOrgOwnerEmail(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  // Best-effort: org owner account is id === org_id.
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', orgId)
    .maybeSingle()

  const email = (data as Record<string, unknown> | null)?.email
  return typeof email === 'string' && email.includes('@') ? email : null
}

async function sendResendEmail(args: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[coachingDigest] RESEND_API_KEY missing')
    return { ok: false as const, skipped: 'no_api_key' as const }
  }

  const from = process.env.RESEND_FROM ?? 'support@dealerwyze.com'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      text: args.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn('[coachingDigest] resend failed:', res.status, body.slice(0, 200))
    return { ok: false as const, skipped: 'send_failed' as const }
  }

  return { ok: true as const }
}

export async function buildCoachingDigestForOrg(args: { supabase?: SupabaseClient; orgId: string }) {
  const supabase = args.supabase ?? createServiceClient()
  const orgId = args.orgId

  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 7)
  const prevFrom = new Date(from)
  prevFrom.setDate(prevFrom.getDate() - 7)

  const [{ data: org }, { data: settings }, { data: audits }] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    // Select * so missing columns won't break older DBs.
    supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
    supabase
      .from('lost_lead_audit')
      .select('root_cause_json, root_cause_needs_review, root_cause_ran_at')
      .eq('org_id', orgId)
      .not('root_cause_json', 'is', null)
      .gte('root_cause_ran_at', from.toISOString()),
  ])

  const coachingEnabled = (settings as Record<string, unknown> | null)?.coaching_digest_enabled
  if (coachingEnabled === false) {
    return { ok: false as const, skipped: 'disabled' as const, subject: '', text: '' }
  }

  const cache = ((settings as Record<string, unknown> | null)?.performance_cache ?? null) as OrgPerformanceCache | null
  const patterns = cache?.messagingPatterns

  const safePatterns: MessagingPatternsCache = {
    responseTimeBuckets: ensureSample10(patterns?.responseTimeBuckets),
    messageLengthBuckets: ensureSample10(patterns?.messageLengthBuckets),
    firstTouchPhrases: ensureSample10(patterns?.firstTouchPhrases),
    sequenceStepDropoff: ensureSample10(patterns?.sequenceStepDropoff),
    channelEffectiveness: ensureSample10(patterns?.channelEffectiveness),
  }

  const weekAudits = (audits ?? []) as Array<{ root_cause_json?: unknown; root_cause_needs_review?: boolean | null }>
  const accepted = weekAudits
    .filter(a => !a.root_cause_needs_review)
    .map(a => a.root_cause_json)
    .filter(Boolean) as unknown[]

  const parsed: RootCauseJson[] = accepted
    .map(item => item as RootCauseJson)
    .filter(item =>
      item
      && typeof item.failure_mode === 'string'
      && typeof item.coaching_note === 'string'
      && typeof item.confidence === 'number',
    )

  const failureModes = parsed.map(p => p.failure_mode).filter(Boolean) as FailureMode[]
  const topFailure = mostCommon(failureModes)

  const correctable = parsed.filter(p => p.rep_controllable && p.failure_mode !== 'unknown')
  const topCorrectable = mostCommon(correctable.map(p => p.failure_mode))

  const [currentReply, previousReply] = await Promise.all([
    computeTeamReplyRate({ supabase, orgId, fromIso: from.toISOString(), toIso: now.toISOString() }),
    computeTeamReplyRate({ supabase, orgId, fromIso: prevFrom.toISOString(), toIso: from.toISOString() }),
  ])

  const replyDelta = currentReply.rate - previousReply.rate
  const replyTrend =
    previousReply.total < 10 || currentReply.total < 10
      ? null
      : (replyDelta === 0 ? 'flat' : (replyDelta > 0 ? 'up' : 'down'))

  const bestHour = safePatterns.responseTimeBuckets?.[0] ?? null
  const worstStep = safePatterns.sequenceStepDropoff?.[0] ?? null

  const dealerName = (org as Record<string, unknown> | null)?.name
  const orgName = typeof dealerName === 'string' && dealerName.trim() ? dealerName.trim() : 'your dealership'

  const lines: string[] = []
  lines.push(`Weekly Coaching Digest — ${orgName}`)
  lines.push('')
  lines.push('This is a team-level snapshot (no individual rep callouts).')
  lines.push('')

  const insights: string[] = []

  if (topFailure.value) {
    insights.push(`Most common loss pattern this week: ${topFailure.value.replace(/_/g, ' ')} (${topFailure.count}).`)
  }

  if (bestHour) {
    insights.push(`Best time window for outbound messages: around ${hourLabel(bestHour.hour)} (reply rate ${bestHour.replyRate}%, N=${bestHour.sampleSize}).`)
  }

  if (worstStep) {
    insights.push(`Sequence step to review: ${worstStep.sequenceName} step ${worstStep.stepNumber} (silence ${worstStep.silenceRate}%, N=${worstStep.sampleSize}).`)
  }

  if (replyTrend) {
    const direction = replyTrend === 'up' ? 'improved' : replyTrend === 'down' ? 'dropped' : 'held steady'
    insights.push(`Positive callout: your team reply rate ${direction} to ${currentReply.rate}% (was ${previousReply.rate}%).`)
  }

  if (topCorrectable.value) {
    insights.push(`Pattern to watch (most correctable): ${topCorrectable.value.replace(/_/g, ' ')} (${topCorrectable.count}).`)
  }

  // Always render without crashing; even an empty week gets a valid email body.
  if (insights.length === 0) {
    insights.push('Not enough data this week to surface reliable insights yet. Keep replying fast and logging follow-ups.')
  }

  lines.push('## Insights')
  for (const insight of insights.slice(0, 5)) {
    // Enforce “your team” framing implicitly by never mentioning individuals.
    lines.push(`- ${insight}`)
  }

  lines.push('')
  lines.push('If you want, reply to this email with what you want to improve next week, and we’ll tune the focus.')

  const subject = 'Your weekly coaching digest (team-level)'
  const text = lines.join('\n')

  return { ok: true as const, subject, text, insightsCount: insights.length }
}

export async function sendCoachingDigestForOrg(args: { supabase?: SupabaseClient; orgId: string }) {
  const supabase = args.supabase ?? createServiceClient()
  const orgId = args.orgId

  const built = await buildCoachingDigestForOrg({ supabase, orgId })
  if (!built.ok) return built

  const to = await resolveOrgOwnerEmail(supabase, orgId)
  if (!to) {
    console.warn('[coachingDigest] org owner email missing; skipping send')
    return { ok: false as const, skipped: 'no_owner_email' as const, subject: built.subject, text: built.text }
  }

  const sent = await sendResendEmail({ to, subject: built.subject, text: built.text })
  if (!sent.ok) return { ok: false as const, skipped: sent.skipped, subject: built.subject, text: built.text }

  return { ok: true as const, subject: built.subject, text: built.text }
}

