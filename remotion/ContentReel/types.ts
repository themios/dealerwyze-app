export interface ContentSlide {
  headline: string
  body?: string
  emoji?: string
  backgroundImageUrl?: string  // per-slide background (overrides default)
}

export interface ContentReelProps {
  brandName: string
  brandHandle: string
  accentColor: string
  bgColor: string
  topic: string
  tagline?: string
  slides: ContentSlide[]
  ctaText: string
  watermark: boolean
  // Media
  logoUrl?: string             // brand logo shown on every slide (top-left)
  website?: string             // shown on CTA slide when no ctaImages provided
  backgroundImageUrl?: string  // default background image for all slides
  ctaImages?: string[]         // images shown on closing slide (business card, QR, etc.)
  narrationUrl?: string        // audio track URL
  totalDurationFrames?: number // overrides slide-count-based duration to match audio length
}

export const DEFAULT_CONTENT_PROPS: ContentReelProps = {
  brandName:   'DealerWyze',
  brandHandle: '@dealerwyze',
  accentColor: '#f97316',
  bgColor:     '#0f172a',
  topic:       '5 Reasons Dealers Lose Leads',
  tagline:     'And what to do instead',
  slides: [
    { headline: 'No follow-up system',      body: 'Most dealers call once and move on. Buyers need 5+ touches.', emoji: '📞' },
    { headline: 'Slow response time',        body: 'Speed-to-lead is everything. First responder wins 78% of deals.', emoji: '⚡' },
    { headline: 'Generic messaging',         body: 'Copy-paste texts get ignored. Personalized follow-up converts.', emoji: '✉️' },
    { headline: 'No visibility on the lot',  body: 'If you can\'t see where every lead is, you can\'t close it.', emoji: '👁️' },
    { headline: 'Staff accountability gaps', body: 'Without tracking, tasks fall through cracks every single day.', emoji: '📋' },
  ],
  ctaText:   'Follow @dealerwyze for dealer growth tips',
  watermark: true,
}
