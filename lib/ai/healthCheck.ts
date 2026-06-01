import 'server-only'
import { getAiClient, AI_MODEL } from './client'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

/**
 * Ping the primary AI model with a minimal request.
 * If the model is unavailable (retired/renamed), sends a Telegram alert so
 * the model name can be updated before dealers are affected.
 *
 * Called from the daily check-tasks cron. Never throws — failures are silent
 * beyond the Telegram alert so they don't break the cron run.
 */
export async function checkAiModelHealth(): Promise<{ ok: boolean; model: string; error?: string }> {
  try {
    const response = await getAiClient().chat.completions.create({
      model: AI_MODEL,
      max_tokens: 5,
      messages: [{ role: 'user', content: 'hi' }],
    })
    const replied = !!response.choices[0]?.message?.content
    return { ok: replied, model: AI_MODEL }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isRetired = msg.includes('No endpoints') || msg.includes('not found') || msg.includes('404')

    const alertText = isRetired
      ? `⚠️ AI model retired: \`${AI_MODEL}\` is no longer available on OpenRouter.\n\nUpdate \`AI_MODEL\` in \`lib/ai/client.ts\` to a current model. Until fixed, all AI features fall back to Claude Haiku.`
      : `⚠️ AI health check failed for \`${AI_MODEL}\`:\n${msg.slice(0, 300)}`

    await sendTelegramMessage(alertText).catch(() => {})
    return { ok: false, model: AI_MODEL, error: msg.slice(0, 200) }
  }
}
