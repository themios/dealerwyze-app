#!/usr/bin/env node

/**
 * Verify showing workflow emails via Resend API.
 *
 * Usage:
 *   node scripts/verify-showing-emails.mjs \
 *     --agent noreply@realtywyze.us \
 *     --buyer tim+example@dealerwyze.com \
 *     --minutes 180
 *
 * Required env:
 *   RESEND_API_KEY
 */

function parseArgs(argv) {
  const args = {
    agent: undefined,
    buyer: undefined,
    minutes: 180,
    limit: 100,
  }

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const next = argv[i + 1]
    if (key === '--agent' && next) {
      args.agent = next
      i++
    } else if (key === '--buyer' && next) {
      args.buyer = next
      i++
    } else if (key === '--minutes' && next) {
      args.minutes = Number(next)
      i++
    } else if (key === '--limit' && next) {
      args.limit = Number(next)
      i++
    }
  }
  return args
}

function isShowingAgentNotification(email, agentTo) {
  const toList = Array.isArray(email.to) ? email.to : []
  const toMatch = toList.includes(agentTo)
  const subject = String(email.subject || '').toLowerCase()
  return toMatch && subject.includes('new showing request')
}

function isShowingBuyerNotification(email, buyerTo) {
  const toList = Array.isArray(email.to) ? email.to : []
  const toMatch = toList.includes(buyerTo)
  const subject = String(email.subject || '').toLowerCase()
  return (
    toMatch &&
    (subject.includes('your showing is confirmed') || subject.includes('your showing request'))
  )
}

async function main() {
  const { agent, buyer, minutes, limit } = parseArgs(process.argv.slice(2))
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('Missing RESEND_API_KEY')
    process.exit(2)
  }
  if (!agent || !buyer) {
    console.error('Usage: --agent <email> --buyer <email> [--minutes <n>] [--limit <n>]')
    process.exit(2)
  }

  const url = new URL('https://api.resend.com/emails')
  url.searchParams.set('limit', String(limit > 0 ? limit : 100))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`Resend API error (${res.status}): ${body}`)
    process.exit(2)
  }

  const payload = await res.json()
  const emails = Array.isArray(payload.data) ? payload.data : []
  const cutoff = Date.now() - Math.max(minutes, 1) * 60 * 1000

  const recent = emails.filter((e) => {
    const created = Date.parse(e.created_at || '')
    return Number.isFinite(created) && created >= cutoff
  })

  const agentMatch = recent.find((e) => isShowingAgentNotification(e, agent))
  const buyerMatch = recent.find((e) => isShowingBuyerNotification(e, buyer))

  const result = {
    ok: Boolean(agentMatch && buyerMatch),
    checked_count: recent.length,
    window_minutes: minutes,
    agent_expected: agent,
    buyer_expected: buyer,
    agent_match: agentMatch
      ? {
          id: agentMatch.id,
          to: agentMatch.to,
          subject: agentMatch.subject,
          created_at: agentMatch.created_at,
          last_event: agentMatch.last_event,
        }
      : null,
    buyer_match: buyerMatch
      ? {
          id: buyerMatch.id,
          to: buyerMatch.to,
          subject: buyerMatch.subject,
          created_at: buyerMatch.created_at,
          last_event: buyerMatch.last_event,
        }
      : null,
  }

  console.log(JSON.stringify(result, null, 2))
  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('verify-showing-emails failed:', err)
  process.exit(2)
})

