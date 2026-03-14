/**
 * POST /api/telegram/webhook
 * ─────────────────────────────────────────────────────────────────────────────
 * Telegram calls this endpoint every time someone messages the bot.
 *
 * Security:
 *   - X-Telegram-Bot-Api-Secret-Token header must match TELEGRAM_WEBHOOK_SECRET
 *   - Messages from unrecognized chat IDs are silently ignored
 *
 * Two message flows:
 *
 *   1. VERIFICATION (dealer onboarding)
 *      If the message text is a 6-digit number, the webhook checks whether
 *      it matches an active verify code in org_settings. If found, it saves
 *      the dealer's Telegram chat_id to their org and confirms in chat.
 *
 *   2. AI QUERY (ongoing use)
 *      If the chat_id is already linked to an org (or is Tim's personal chat),
 *      the webhook pulls live CRM data for that org and passes it to Claude,
 *      then sends the response back to the dealer.
 *      Example questions: "any new leads today?", "which cars are overpriced?"
 *
 * Env vars required:
 *   TELEGRAM_BOT_TOKEN        — from BotFather
 *   TELEGRAM_WEBHOOK_SECRET   — set when registering the webhook
 *   TELEGRAM_CHAT_ID          — Tim's personal chat (fallback / platform use)
 *   APOLLO_ORG_ID             — Tim's org UUID (used when chatting as Tim)
 *   ANTHROPIC_API_KEY         — for Claude AI responses
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramToOrg } from '@/lib/notifications/telegram'

export const runtime   = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the request ─────────────────────────────────────────
  const secret         = req.headers.get('x-telegram-bot-api-secret-token')
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expectedSecret || secret !== expectedSecret) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return NextResponse.json({ ok: true }) // ignore malformed payloads
  }

  const message = update.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const incomingChatId = String(message.chat.id)
  const text           = message.text.trim()
  const supabase       = createServiceClient()

  // ── 2. Verification flow — 6-digit code ──────────────────────────────────
  if (/^\d{6}$/.test(text)) {
    const { data: orgRow } = await supabase
      .from('org_settings')
      .select('org_id')
      .eq('telegram_verify_code', text)
      .gt('telegram_verify_expires_at', new Date().toISOString())
      .maybeSingle()

    if (orgRow) {
      // Save chat_id, clear the one-time code
      await supabase
        .from('org_settings')
        .update({
          telegram_chat_id:             incomingChatId,
          telegram_verify_code:         null,
          telegram_verify_expires_at:   null,
        })
        .eq('org_id', orgRow.org_id)

      await sendTelegramToOrg(
        incomingChatId,
        '<b>Connected!</b>\n\nYou will now receive instant notifications when a new lead comes in.\n\nYou can also ask me questions any time:\n- "Any new leads today?"\n- "Which cars are overpriced?"\n- "Who needs a follow-up?"',
      )
      return NextResponse.json({ ok: true })
    }
    // If no code matched, fall through to normal query flow
  }

  // ── 3. Resolve which org this chat belongs to ────────────────────────────
  let orgId: string | null = null

  // Check org_settings for a linked chat_id
  const { data: linked } = await supabase
    .from('org_settings')
    .select('org_id')
    .eq('telegram_chat_id', incomingChatId)
    .maybeSingle()

  if (linked) {
    orgId = linked.org_id
  } else if (incomingChatId === process.env.TELEGRAM_CHAT_ID) {
    // Tim's personal chat — fall back to APOLLO_ORG_ID env var
    orgId = process.env.APOLLO_ORG_ID ?? null
  }

  // Ignore messages from unknown chats — no response, no error
  if (!orgId) return NextResponse.json({ ok: true })

  // ── 4. Build live CRM context for this org ───────────────────────────────
  const context = await buildOrgContext(orgId)

  // ── 5. Call Claude with context + dealer's question ───────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let reply: string
  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a concise dealership assistant for a used-car dealership using DealerWyze CRM.
Answer questions directly and briefly. Use plain text only — no markdown, no bullet symbols (use dashes or numbers).
Never reveal technical details like UUIDs, table names, or internal IDs.
Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

LIVE DEALERSHIP DATA:
${context}`,
      messages: [{ role: 'user', content: text }],
    })

    const block = response.content[0]
    reply = block.type === 'text' ? block.text : 'Sorry, I could not generate a response.'
  } catch {
    reply = 'Something went wrong. Try again in a moment.'
  }

  await sendTelegramToOrg(incomingChatId, reply)
  return NextResponse.json({ ok: true })
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildOrgContext(orgId: string): Promise<string> {
  try {
    const supabase = createServiceClient()
    const now      = new Date()
    const since48h = new Date(now.getTime() -  2 * 86400000).toISOString()
    const since7d  = new Date(now.getTime() -  7 * 86400000).toISOString()

    // Inbound messages in the last 48 hours
    const { data: recentLeads } = await supabase
      .from('activities')
      .select('created_at, type, body, customer_id')
      .eq('user_id', orgId)
      .eq('direction', 'inbound')
      .in('type', ['email', 'sms', 'web_lead'])
      .gte('created_at', since48h)
      .order('created_at', { ascending: false })
      .limit(20)

    // Customers due for follow-up (last contacted >7 days ago)
    const { data: followUps } = await supabase
      .from('customers')
      .select('id, name, primary_phone, last_contacted_at, lead_source')
      .eq('user_id', orgId)
      .is('deactivated_at', null)
      .gte('updated_at', since7d)
      .order('last_contacted_at', { ascending: true })
      .limit(10)

    // Active inventory with pricing vs market
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('year, make, model, price, status, market_data_json, created_at, mileage')
      .eq('user_id', orgId)
      .in('status', ['available', 'pending'])
      .order('created_at', { ascending: true })
      .limit(30)

    // Org name + basic info
    const { data: org } = await supabase
      .from('organizations')
      .select('name, phone, city, state')
      .eq('id', orgId)
      .maybeSingle()

    const lines: string[] = []

    lines.push(`DEALERSHIP: ${org?.name ?? 'Unknown'} | ${[org?.city, org?.state].filter(Boolean).join(', ') || 'location unknown'} | ${org?.phone ?? 'no phone'}`)
    lines.push(`\nRECENT INBOUND MESSAGES (last 48h): ${recentLeads?.length ?? 0}`)
    for (const a of recentLeads ?? []) {
      const when    = new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      const snippet = (a.body ?? '').slice(0, 120).replace(/\n/g, ' ')
      lines.push(`  [${when}] ${a.type}: ${snippet}`)
    }

    lines.push(`\nCUSTOMERS TO FOLLOW UP (last 7d):`)
    for (const c of followUps ?? []) {
      const last = c.last_contacted_at
        ? new Date(c.last_contacted_at).toLocaleString('en-US', { month: 'short', day: 'numeric' })
        : 'never'
      lines.push(`  ${c.name} (${c.lead_source ?? 'unknown'}) - last contact: ${last}`)
    }

    lines.push(`\nINVENTORY (${vehicles?.length ?? 0} vehicles):`)
    for (const v of vehicles ?? []) {
      const daysOnLot = Math.floor((now.getTime() - new Date(v.created_at).getTime()) / 86400000)
      const market    = v.market_data_json as Record<string, number> | null
      let pricingNote = ''
      if (v.price && market?.fairMarketPrice) {
        const pct = ((v.price - market.fairMarketPrice) / market.fairMarketPrice) * 100
        pricingNote = ` | ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs market`
      }
      lines.push(`  ${v.year} ${v.make} ${v.model} | $${v.price?.toLocaleString() ?? '?'} | ${daysOnLot}d on lot${pricingNote} | ${v.status}`)
    }

    return lines.join('\n')
  } catch {
    return 'Could not load dealership data.'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramUpdate {
  message?: {
    text?: string
    chat: { id: number }
  }
}
