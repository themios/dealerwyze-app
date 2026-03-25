import 'server-only'
import { IntelligencePayload } from './metrics'

const SYSTEM_PROMPT = `You are a sharp operations analyst for small independent used-car dealers.
Rules: Only use numbers from the JSON payload. No invented data. No fluff. Be direct and specific.
CRITICAL: Your entire response must be a single raw JSON object. Start with { and end with }. No markdown, no code fences, no explanation before or after.`

function buildUserPrompt(payload: IntelligencePayload): string {
  return `Generate a dealer morning brief JSON using ONLY data from the payload below.

OUTPUT: a single JSON object with these exact fields (no extra keys):
"headline": one punchy sentence covering sales + leads + BHPH health today (max 20 words),
"bullets": exactly 3 strings, most critical business facts, max 15 words each,
"key_lever": single most impactful action for today (max 15 words),
"scorecards": array of 8 objects {label, value, delta, status("good"|"warn"|"bad"|"neutral")},
  Use these 8 labels in order: "Units Sold (MTD)", "Revenue (MTD)", "BHPH Overdue", "Active BHPH Loans", "Leads Yesterday", "Response Rate", "Lead→Appt Rate", "Tasks Overdue",
"top_actions": exactly 3 objects {rank(1-3), action(max 15 words), minutes(number)},
"performance_insight": one sentence on lead response rate and conversion (use salesperson_performance data),
"sales_insight": one sentence on units sold and revenue trend (use sales_metrics data),
"bhph_insight": one sentence on BHPH portfolio health — overdue accounts, upcoming payments, default risk (use bhph_metrics data),
"lead_insight": one sentence on lead flow vs average,
"inventory_insight": one sentence on inventory age risk or opportunity,
"discipline_insight": one sentence on task completion and follow-up compliance,
"twilio_insight": one sentence on SMS usage rate, quota health, and response effectiveness (use twilio_metrics data),
"pricing_insight": one sentence on how inventory is priced vs. market — call out overpriced units by name if any, avg premium/discount, and pricing strategy impact on turn rate (use pricing_intelligence data),
"retention_insight": one sentence on retention activity — active sequences, cards sent this month, upcoming birthdays, and referrals (use retention_metrics data; omit if all zeros),
"alerts": array of 0-4 objects {severity("warn"|"critical"), message(max 20 words)} — include BHPH overdue and defaulted alerts if applicable,

PAYLOAD:
${JSON.stringify(payload)}`
}

export interface BriefReport {
  headline: string
  bullets: string[]
  key_lever: string
  scorecards: Array<{ label: string; value: string; delta: string; status: 'good' | 'warn' | 'bad' | 'neutral' }>
  top_actions: Array<{ rank: number; action: string; minutes: number }>
  performance_insight: string
  sales_insight: string
  bhph_insight: string
  lead_insight: string
  inventory_insight: string
  discipline_insight: string
  twilio_insight: string
  pricing_insight: string
  retention_insight: string
  alerts: Array<{ severity: 'warn' | 'critical'; message: string }>
}

export interface BriefingResult {
  report_json: BriefReport
  tokens_used: number
}

export async function generateBriefing(payload: IntelligencePayload): Promise<BriefingResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment variables')

  // Lazy-load so groq-sdk is never required at module eval (avoids client bundle loading it)
  const { default: Groq } = await import('groq-sdk')
  const client = new Groq({ apiKey })
  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1600,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(payload) },
    ],
  })

  const text = completion.choices[0]?.message?.content ?? ''
  const tokens_used = (completion.usage?.prompt_tokens ?? 0) + (completion.usage?.completion_tokens ?? 0)

  // Extract JSON robustly: find outermost { ... }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in response: ${text.slice(0, 300)}`)
  }

  let report_json: BriefReport
  try {
    report_json = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error(`Invalid JSON from Groq: ${text.slice(start, start + 300)}`)
  }

  return { report_json, tokens_used }
}
