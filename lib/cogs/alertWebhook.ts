/**
 * COGS alert delivery — usage/cost-related admin alerts to:
 * - Optional webhook URL (Slack, etc.): COGS_ALERT_WEBHOOK_URL
 * - Optional Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
 * - Optional SMS (Twilio): COGS_ALERT_PHONE (E.164); throttled per alert_type+org per 15 min
 *
 * If none set, no-op. Fire-and-forget: never throws; failures are logged only.
 */

import { logger } from '@/lib/logger'

const WEBHOOK_URL = process.env.COGS_ALERT_WEBHOOK_URL
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim()
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim()
const ALERT_PHONE = process.env.COGS_ALERT_PHONE?.trim()

/** Throttle SMS: same (alert_type, org_id) at most once per 15 min */
const SMS_THROTTLE_MS = 15 * 60 * 1000
const smsLastSent = new Map<string, number>()

function throttleKey(payload: { alert_type: string; org_id: string }) {
  return `${payload.alert_type}:${payload.org_id}`
}

export type CogsAlertType =
  | 'voice_abuse_hard_cap'
  | 'voice_cap_reached'
  | 'voice_500min_warning'
  | 'repeated_caller'
  | 'voice_spike'
  | 'quota_80pct'
  | 'quota_exceeded'
  | '2x_quota_exceeded'

export interface CogsAlertPayload {
  org_id: string
  org_name?: string
  alert_type: CogsAlertType
  severity: string
  metadata?: Record<string, unknown>
  created_at: string
}

function shortMessage(payload: CogsAlertPayload): string {
  const name = payload.org_name ? ` (${payload.org_name})` : ''
  return `DealerWyze${name}: ${payload.alert_type} — org ${payload.org_id.slice(0, 8)}…`
}

async function sendTelegram(payload: CogsAlertPayload): Promise<void> {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return
  const text = shortMessage(payload)
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      logger.warn('cogs_telegram', 'Telegram send failed', { status: res.status, alert_type: payload.alert_type, org_id: payload.org_id })
    }
  } catch (err) {
    logger.warn('cogs_telegram', 'Telegram request failed', { error: String(err), alert_type: payload.alert_type, org_id: payload.org_id })
  }
}

async function sendSms(payload: CogsAlertPayload): Promise<void> {
  if (!ALERT_PHONE) return
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) return

  const key = throttleKey(payload)
  const now = Date.now()
  if ((smsLastSent.get(key) ?? 0) + SMS_THROTTLE_MS > now) return
  smsLastSent.set(key, now)
  // Prune old entries
  for (const [k, t] of smsLastSent.entries()) {
    if (t + SMS_THROTTLE_MS < now) smsLastSent.delete(k)
  }

  const body = shortMessage(payload)
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        },
        body: new URLSearchParams({ To: ALERT_PHONE, From: from, Body: body }),
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      logger.warn('cogs_sms', 'Twilio COGS alert SMS failed', { status: res.status, alert_type: payload.alert_type, code: (data as { code?: number }).code })
    }
  } catch (err) {
    logger.warn('cogs_sms', 'COGS alert SMS request failed', { error: String(err), alert_type: payload.alert_type, org_id: payload.org_id })
  }
}

export async function fireCogsAlert(payload: CogsAlertPayload): Promise<void> {
  const full = { ...payload, source: 'dealerwyze-cogs' as const }

  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(full),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        logger.warn('cogs_webhook', 'COGS webhook returned non-OK', { status: res.status, alert_type: payload.alert_type, org_id: payload.org_id })
      }
    } catch (err) {
      logger.warn('cogs_webhook', 'COGS webhook request failed', { error: String(err), alert_type: payload.alert_type, org_id: payload.org_id })
    }
  }

  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) void sendTelegram(payload)
  if (ALERT_PHONE) void sendSms(payload)
}

/** Fire in background; do not await. Use after inserting a COGS-related admin_alert. */
export function fireCogsAlertBackground(payload: CogsAlertPayload): void {
  void fireCogsAlert(payload)
}
