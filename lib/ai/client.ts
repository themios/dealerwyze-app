import OpenAI from 'openai'

// Single OpenAI-compatible client routed through OpenRouter → Gemini 2.0 Flash Lite.
// All former Anthropic and vision calls use this client.
export const aiClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
})

export const AI_MODEL = 'google/gemini-2.0-flash-lite-001'

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
