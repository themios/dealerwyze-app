import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { ContentReelProps } from '@/lib/remotion/types'

const PLATFORM_RULES: Record<string, string> = {
  instagram: 'Max 2200 chars. Hook in first 8 words (truncated after). 8-15 hashtags at end. End with: "Comment [KEYWORD] for more."',
  facebook:  'Max 500 chars for feed. Conversational, no hashtag spam. 3-5 hashtags max.',
  tiktok:    'Max 2200 chars. Hook first, very short sentences. End with CTA. 3-5 hashtags. High energy.',
  youtube:   'Max 500 chars for short description. Descriptive, keyword-rich. 3-5 hashtags.',
  linkedin:  'Max 3000 chars. Professional tone. Lead with insight. Short paragraphs. No hashtag spam (3 max). End with question or clear takeaway.',
  threads:   'Max 500 chars. Short, conversational, opinionated. Single sharp insight. 0-3 hashtags.',
}

const SYSTEM_PROMPT = `You write platform-optimized social media captions for DealerWyze, a CRM platform for used-car dealers.
Voice: direct, dealer-savvy, no corporate fluff. Speak to dealer owners and GMs.
Output ONLY the caption text. No preamble, no quotes around it, no explanation.`

export async function generateContentCaption(
  props: ContentReelProps,
  platform: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return buildFallbackCaption(props, platform)

  const rules = PLATFORM_RULES[platform] ?? PLATFORM_RULES.instagram
  const slidesSummary = props.slides
    .map((s, i) => `${i + 1}. ${s.headline}${s.body ? ': ' + s.body : ''}`)
    .join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      messages: [{
        role:    'user',
        content: `Write a ${platform} caption for this content reel.

Topic: ${props.topic}
${props.tagline ? `Tagline: ${props.tagline}` : ''}
Brand: ${props.brandName} (${props.brandHandle})
CTA: ${props.ctaText}

Slide content:
${slidesSummary}

Platform rules: ${rules}`,
      }],
    })

    const text = response.content[0]
    if (text.type === 'text') return text.text.trim()
  } catch (err) {
    console.error('[captionGenerator] Anthropic call failed:', err)
  }

  return buildFallbackCaption(props, platform)
}

function buildFallbackCaption(props: ContentReelProps, platform: string): string {
  const headlines = props.slides.map((s, i) => `${i + 1}. ${s.headline}`).join('\n')
  const base = `${props.topic}\n\n${headlines}\n\n${props.ctaText}\n\n${props.brandHandle}`
  if (platform === 'instagram') return base + '\n\n#dealerwyze #usedcardealers #cardealership #autodealer #dealerlife'
  if (platform === 'tiktok')   return base + '\n\n#dealerwyze #cardealership #fyp'
  if (platform === 'linkedin') return base
  return base
}
