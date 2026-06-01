import OpenAI from 'openai'

export const AI_MODEL = 'google/gemini-2.5-flash-lite'

// Lazy singleton: OpenAI-compatible client routed through OpenRouter → Gemini 2.0 Flash Lite.
// Deferred initialization avoids import-time failures when OPENROUTER_API_KEY is missing (e.g., in tests).
let _aiClient: OpenAI | null = null

export function getAiClient(): OpenAI {
  if (!_aiClient) {
    _aiClient = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseURL: 'https://openrouter.ai/api/v1',
    })
  }
  return _aiClient
}

// For backward compatibility, export a getter property
Object.defineProperty(globalThis, 'aiClient', {
  get: () => getAiClient(),
  enumerable: false,
})

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
