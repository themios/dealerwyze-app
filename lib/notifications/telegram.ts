/**
 * Telegram notification helper
 * ─────────────────────────────────────────────────────────────────────────────
 * Two sending modes:
 *
 *   sendTelegramMessage(text)
 *     Sends to Tim's platform chat (TELEGRAM_CHAT_ID env var).
 *     Used for platform-level alerts: new dealer sign-ups, system errors, etc.
 *
 *   sendTelegramToOrg(chatId, text)
 *     Sends to a specific dealer's connected Telegram chat.
 *     Used for per-dealer notifications: new leads, pricing alerts, etc.
 *
 * Both are non-fatal — a Telegram failure will never crash the calling request.
 * Both require TELEGRAM_BOT_TOKEN to be set in env vars.
 */

/**
 * Send a message to Tim's platform Telegram chat.
 * Requires: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!chatId) return
  await _send(chatId, text)
}

/**
 * Send a message to a specific dealer's connected Telegram chat.
 * @param chatId  The dealer's telegram_chat_id from org_settings
 * @param text    HTML-formatted message text
 */
export async function sendTelegramToOrg(chatId: string, text: string): Promise<void> {
  if (!chatId) return
  await _send(chatId, text)
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function _send(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch {
    // Non-fatal — never let a Telegram failure affect the main request flow
  }
}
