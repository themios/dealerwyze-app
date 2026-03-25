import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import Groq from 'groq-sdk'

export const dynamic = 'force-dynamic'

function fmtTime(seconds: number | null): string {
  if (!seconds) return 'N/A'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

export async function POST(req: Request) {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const body = await req.json() as {
    stats: {
      totals: Record<string, number>
      responseRate: number
      avgResponseTimeSeconds: number | null
      byType: Record<string, number>
      bySource: Record<string, number>
      byStage: Record<string, number>
      callOutcomes: Record<string, number>
      hotLeads: number
    }
    reps: Array<{
      name: string; role: string
      outbound: number; inbound: number; calls: number; sms: number; emails: number
      answered: number; noAnswer: number; leftVm: number
      avgResponseTimeSeconds: number | null; assignedTotal: number
    }>
    period: { from: string; to: string }
  }

  const { stats, reps, period } = body
  const fromLabel = new Date(period.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const toLabel   = new Date(period.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const repLines = reps.map(r =>
    `- ${r.name} (${r.role}): ${r.outbound} outbound, ${r.calls} calls (${r.answered} answered / ${r.noAnswer} no answer / ${r.leftVm} voicemail), ${r.sms} texts, ${r.emails} emails, avg response time: ${fmtTime(r.avgResponseTimeSeconds)}, assigned leads: ${r.assignedTotal}`
  ).join('\n')

  const stageLines = Object.entries(stats.byStage)
    .map(([s, n]) => `  ${s}: ${n}`)
    .join('\n')

  const sourceLines = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([s, n]) => `  ${s}: ${n}`)
    .join('\n')

  const prompt = `You are a dealership performance coach reviewing CRM data for a used-car dealership. Be direct, specific, and actionable. No generic advice.

PERIOD: ${fromLabel} - ${toLabel}

ACTIVITY SUMMARY:
- Total activities: ${stats.totals.activities}
- Inbound leads: ${stats.totals.inbound}
- Outbound contacts: ${stats.totals.outbound}
- Manual outbound: ${stats.totals.manualOutbound}
- Autoresponder messages: ${stats.totals.autoresponder}
- Unique leads contacted: ${stats.totals.uniqueLeads}
- Leads responded to: ${stats.totals.responded}
- Response rate: ${fmtPct(stats.responseRate)} (industry target: >80%)
- Avg response time: ${fmtTime(stats.avgResponseTimeSeconds)} (industry target: <15 minutes)
- Hot leads: ${stats.hotLeads}
- New customers: ${stats.totals.newCustomers}

CALL OUTCOMES:
${Object.entries(stats.callOutcomes).map(([o, n]) => `  ${o}: ${n}`).join('\n')}

PIPELINE (all time):
${stageLines}

TOP LEAD SOURCES (this period):
${sourceLines}

REP PERFORMANCE:
${repLines}

Write a performance brief with exactly three sections:

## What's Working
2-3 specific observations based on the actual numbers above. Reference real metrics.

## Gaps and Risks
2-3 specific problems. Flag any rep with avg response time >2 hours, response rate <70%, or high no-answer rate. Flag if autoresponder is doing more work than reps. Reference actual numbers.

## Action Plan
3-5 ranked, specific actions. Each must reference a specific metric or rep name. Format each as: [PRIORITY] Action — Expected impact.

Keep total response under 350 words. No bullet padding, no platitudes.`

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
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
