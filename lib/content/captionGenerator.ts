import 'server-only'
import { aiComplete, AI_MODEL } from '@/lib/ai/client'
import type { ContentReelProps } from '@/lib/remotion/types'
import type { Vertical } from '@/lib/vertical'

const PLATFORM_RULES: Record<string, string> = {
  instagram: 'Max 2200 chars. Hook in first 8 words (truncated after). 8-15 hashtags at end. End with: "Comment [KEYWORD] for more."',
  facebook:  'Max 500 chars for feed. Conversational, no hashtag spam. 3-5 hashtags max.',
  tiktok:    'Max 2200 chars. Hook first, very short sentences. End with CTA. 3-5 hashtags. High energy.',
  youtube:   'Max 500 chars for short description. Descriptive, keyword-rich. 3-5 hashtags.',
  linkedin:  'Max 3000 chars. Professional tone. Lead with insight. Short paragraphs. No hashtag spam (3 max). End with question or clear takeaway.',
  threads:   'Max 500 chars. Short, conversational, opinionated. Single sharp insight. 0-3 hashtags.',
}

const DEALER_SYSTEM_PROMPT = `You write platform-optimized social media captions for DealerWyze, a CRM platform for used-car dealers.
Voice: direct, dealer-savvy, no corporate fluff. Speak to dealer owners and GMs.
Output ONLY the caption text. No preamble, no quotes around it, no explanation.`

const RE_SYSTEM_PROMPT = `You write platform-optimized social media captions for RealtyWyze, a CRM platform for real estate agents and brokers.
Voice: professional, agent-focused, market-aware. Speak to real estate professionals and agencies.
Output ONLY the caption text. No preamble, no quotes around it, no explanation.`

function getSystemPrompt(vertical: Vertical): string {
  return vertical === 'real_estate' ? RE_SYSTEM_PROMPT : DEALER_SYSTEM_PROMPT
}

const DEALER_HASHTAGS: Record<string, string> = {
  instagram: '#dealerwyze #usedcardealers #cardealership #autodealer #dealerlife',
  tiktok: '#dealerwyze #cardealership #fyp',
}

const RE_HASHTAGS: Record<string, string> = {
  instagram: '#realtywyze #realestateprofessional #realestateagent #realestatemarketing #homesales',
  tiktok: '#realtywyze #realestate #realestateagent #homeselling #realestatemarketing',
}

function getHashtags(vertical: Vertical, platform: string): string {
  const hashtagMap = vertical === 'real_estate' ? RE_HASHTAGS : DEALER_HASHTAGS
  return hashtagMap[platform] ?? ''
}

export async function generateContentCaption(
  props: ContentReelProps,
  platform: string,
  vertical: Vertical = 'dealer',
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) return buildFallbackCaption(props, platform, vertical)

  const rules = PLATFORM_RULES[platform] ?? PLATFORM_RULES.instagram
  const slidesSummary = props.slides
    .map((s, i) => `${i + 1}. ${s.headline}${s.body ? ': ' + s.body : ''}`)
    .join('\n')

  try {
    const response = await aiComplete({
      model:      AI_MODEL,
      max_tokens: 600,
      messages: [
        { role: 'system', content: getSystemPrompt(vertical) },
        { role: 'user', content: `Write a ${platform} caption for this content reel.

Topic: ${props.topic}
${props.tagline ? `Tagline: ${props.tagline}` : ''}
Brand: ${props.brandName} (${props.brandHandle})
CTA: ${props.ctaText}

Slide content:
${slidesSummary}

Platform rules: ${rules}` },
      ],
    })

    const text = response.choices[0]?.message?.content
    if (text) return text.trim()
  } catch (err) {
    console.error('[captionGenerator] AI call failed:', err)
  }

  return buildFallbackCaption(props, platform, vertical)
}

function buildFallbackCaption(props: ContentReelProps, platform: string, vertical: Vertical = 'dealer'): string {
  const headlines = props.slides.map((s, i) => `${i + 1}. ${s.headline}`).join('\n')
  const base = `${props.topic}\n\n${headlines}\n\n${props.ctaText}\n\n${props.brandHandle}`
  const hashtags = getHashtags(vertical, platform)
  return hashtags ? base + '\n\n' + hashtags : base
}
