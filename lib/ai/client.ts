import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

// Primary: Gemini 2.5 Flash Lite via OpenRouter (~87% cheaper than Claude Haiku)
export const AI_MODEL = 'google/gemini-2.5-flash-lite'

// Fallback: Claude Haiku via Anthropic directly (stable, long deprecation windows)
const CLAUDE_FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

// ── Clients ───────────────────────────────────────────────────────────────────

let _openRouter: OpenAI | null = null
let _anthropic: Anthropic | null = null

export function getAiClient(): OpenAI {
  if (!_openRouter) {
    _openRouter = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseURL: 'https://openrouter.ai/api/v1',
    })
  }
  return _openRouter
}

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
  }
  return _anthropic
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the error indicates the model is unavailable (retired/renamed). */
function isModelGoneError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('No endpoints') || msg.includes('not found') || msg.includes('404')
}

/** Convert OpenAI-format messages to Anthropic format for the fallback path. */
function toAnthropicMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): { system: string | undefined; messages: Anthropic.MessageParam[] } {
  let system: string | undefined
  const anthropicMessages: Anthropic.MessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : undefined
      continue
    }

    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        anthropicMessages.push({ role: 'user', content: msg.content })
      } else if (Array.isArray(msg.content)) {
        const content: Anthropic.ContentBlockParam[] = []
        for (const part of msg.content) {
          if (part.type === 'text') {
            content.push({ type: 'text', text: part.text })
          } else if (part.type === 'image_url') {
            // Convert data URI back to base64 + mime
            const url = part.image_url.url
            const match = url.match(/^data:([^;]+);base64,(.+)$/)
            if (match) {
              const [, mimeType, data] = match
              if (mimeType === 'application/pdf') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as any)
              } else {
                content.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                    data,
                  },
                })
              }
            }
          }
        }
        anthropicMessages.push({ role: 'user', content })
      }
    } else if (msg.role === 'assistant') {
      anthropicMessages.push({
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : '',
      })
    }
  }

  return { system, messages: anthropicMessages }
}

/** Wrap an Anthropic response in OpenAI shape so callers stay uniform. */
function wrapAnthropicResponse(msg: Anthropic.Message): OpenAI.Chat.Completions.ChatCompletion {
  const text = msg.content.find(b => b.type === 'text')
  return {
    id: msg.id,
    object: 'chat.completion',
    created: Date.now(),
    model: CLAUDE_FALLBACK_MODEL,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text?.type === 'text' ? text.text : '', refusal: null },
      finish_reason: 'stop',
      logprobs: null,
    }],
    usage: {
      prompt_tokens: msg.usage.input_tokens,
      completion_tokens: msg.usage.output_tokens,
      total_tokens: msg.usage.input_tokens + msg.usage.output_tokens,
    },
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Primary AI call. Uses Gemini via OpenRouter; falls back to Claude Haiku via
 * Anthropic directly if the primary model is unavailable (retired, renamed, etc.).
 *
 * All call sites use this instead of getAiClient().chat.completions.create().
 */
export async function aiComplete(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  try {
    return await getAiClient().chat.completions.create(params)
  } catch (err) {
    if (!isModelGoneError(err)) throw err

    // Primary model unavailable — fall back to Claude Haiku
    console.warn(`[ai] Primary model unavailable (${params.model}), falling back to Claude Haiku`)

    const { system, messages } = toAnthropicMessages(params.messages)
    const anthropicMsg = await getAnthropicClient().messages.create({
      model: CLAUDE_FALLBACK_MODEL,
      max_tokens: params.max_tokens ?? 1024,
      ...(system ? { system } : {}),
      messages,
    })

    return wrapAnthropicResponse(anthropicMsg)
  }
}

/** Extract text content from a chat completion response. */
export function aiText(response: OpenAI.Chat.Completions.ChatCompletion): string {
  return response.choices[0]?.message?.content ?? ''
}

/** Build an image_url content block for vision calls (images and PDFs). */
export function imageBlock(mimeType: string, base64: string): OpenAI.Chat.Completions.ChatCompletionContentPartImage {
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${base64}` },
  }
}
