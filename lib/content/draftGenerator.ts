import 'server-only'
import { aiComplete, AI_MODEL } from '@/lib/ai/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Vertical } from '@/lib/vertical'
import type { OrgBrandConfig } from './brandConfig'

export interface ContentDraft {
  id:               string
  org_id:           string
  status:           'pending' | 'approved' | 'rejected' | 'rendered'
  topic:            string
  tagline:          string | null
  slides:           Array<{ headline: string; body?: string; emoji?: string }>
  cta_text:         string
  content_theme:    string | null
  platform_targets: string[]
  background_tags:  string[]
  render_id:        string | null
  created_at:       string
  updated_at:       string
}

// Content theme pillars per brand type
const DEALER_THEMES = [
  { theme: 'lead_management',    tags: ['lot', 'exterior'],    label: 'Lead Management' },
  { theme: 'staff_accountability', tags: ['team', 'interior'], label: 'Staff Accountability' },
  { theme: 'closing_deals',      tags: ['financing', 'signing'], label: 'Closing More Deals' },
  { theme: 'industry_insights',  tags: ['lot', 'exterior'],    label: 'Industry Insights' },
  { theme: 'platform_spotlight', tags: ['team', 'interior'],   label: 'DealerWyze Platform' },
]

const BUYER_THEMES = [
  { theme: 'car_buying_basics',  tags: ['exterior', 'lot'],    label: 'Car Buying Made Simple' },
  { theme: 'credit_financing',   tags: ['financing', 'signing'], label: 'Credit and Financing' },
  { theme: 'vehicle_spotlight',  tags: ['exterior'],            label: 'Vehicle Spotlights' },
  { theme: 'trust_builders',     tags: ['team', 'interior'],   label: 'Trust Builders' },
  { theme: 'local_community',    tags: ['lot', 'exterior'],    label: 'Local Community' },
]

const RE_AGENT_THEMES = [
  { theme: 'lead_generation',    tags: ['community', 'listing'],    label: 'Lead Generation' },
  { theme: 'listing_showcase',   tags: ['property', 'home'],   label: 'Listing Showcase' },
  { theme: 'market_insights',    tags: ['market', 'data'],    label: 'Market Insights' },
  { theme: 'home_buying_tips',   tags: ['buyers', 'process'], label: 'Home Buying Tips' },
  { theme: 'platform_spotlight', tags: ['tools', 'features'],   label: 'RealtyWyze Platform' },
]

const HOMEBUYER_THEMES = [
  { theme: 'home_buying_basics',  tags: ['buyer', 'process'],    label: 'Home Buying Made Simple' },
  { theme: 'mortgage_financing',   tags: ['financing', 'rates'], label: 'Mortgage & Financing' },
  { theme: 'property_spotlight',  tags: ['listing', 'home'],            label: 'Property Spotlights' },
  { theme: 'neighborhood_guides', tags: ['community', 'local'],   label: 'Neighborhood Guides' },
  { theme: 'seller_tips',    tags: ['selling', 'market'],    label: 'Home Selling Tips' },
]

function buildSystemPrompt(config: OrgBrandConfig, isBuyerFacing: boolean, vertical: Vertical = 'dealer'): string {
  if (vertical === 'real_estate') {
    if (isBuyerFacing) {
      return `You generate short-form social media video scripts for ${config.brand_name} (${config.brand_handle}), a real estate team.
Audience: home buyers and sellers — first-time homebuyers, seasoned investors, people anxious about the process. They are skeptical of agents.
Voice: warm, local, knowledgeable, trustworthy. Speak to their concerns about fair pricing and honest guidance.
Never use high-pressure language or fake urgency.`
    }
    return `You generate short-form social media video scripts for ${config.brand_name} (${config.brand_handle}), a CRM platform for real estate agents and brokers.
Audience: real estate professionals and brokers. They are busy, skeptical of software promises.
Voice: direct, peer-to-peer, market-aware. Name their pain points exactly.
Never use corporate buzzwords or vague promises.`
  }

  if (isBuyerFacing) {
    return `You generate short-form social media video scripts for ${config.brand_name} (${config.brand_handle}), a used-car dealership.
Audience: used-car buyers — first-timers, budget-conscious, credit-challenged. They are skeptical of dealers.
Voice: warm, local, honest, no pressure. Speak to their anxiety about financing and getting a fair deal.
Never use high-pressure language or fake urgency.`
  }
  return `You generate short-form social media video scripts for ${config.brand_name} (${config.brand_handle}), a CRM platform for used-car dealers.
Audience: dealer owners and GMs. They are busy, skeptical of software promises.
Voice: direct, peer-to-peer, data-backed. Name their pain points exactly.
Never use corporate buzzwords or vague promises.`
}

function buildUserPrompt(
  theme: { theme: string; label: string },
  config: OrgBrandConfig,
  count: number,
): string {
  return `Generate ${count} distinct content reel scripts on the theme "${theme.label}" for ${config.brand_name}.

Each script must be a JSON object with exactly these fields:
- topic: string (cover headline, max 60 chars, punchy)
- tagline: string (optional sub-line, max 60 chars)
- slides: array of 4-5 objects, each with:
  - headline: string (max 55 chars, bold claim or tip)
  - body: string (max 110 chars, plain talk, specific)
  - emoji: string (1 emoji)
- cta_text: string (max 100 chars, clear call to action)

Return a JSON array of ${count} script objects. No markdown, no explanation, just the JSON array.`
}

export async function generateDraftBatch(
  supabase: SupabaseClient,
  orgId: string,
  config: OrgBrandConfig,
  options: {
    count?: number         // total drafts to generate (default 10)
    isBuyerFacing?: boolean
    themes?: string[]      // specific themes to use, or all if omitted
    vertical?: Vertical
  } = {},
): Promise<ContentDraft[]> {
  // aiComplete is used directly below — no client reference needed
  const count    = options.count ?? 10
  const vertical = options.vertical ?? 'dealer'
  let themes

  if (vertical === 'real_estate') {
    themes = options.isBuyerFacing ? HOMEBUYER_THEMES : RE_AGENT_THEMES
  } else {
    themes = options.isBuyerFacing ? BUYER_THEMES : DEALER_THEMES
  }

  const selected = options.themes
    ? themes.filter(t => options.themes!.includes(t.theme))
    : themes

  const perTheme = Math.ceil(count / selected.length)
  const allDrafts: ContentDraft[] = []

  for (const theme of selected) {
    const batchSize = Math.min(perTheme, count - allDrafts.length)
    if (batchSize <= 0) break

    let scripts: Array<{
      topic: string; tagline?: string
      slides: Array<{ headline: string; body?: string; emoji?: string }>
      cta_text: string
    }>

    try {
      const response = await aiComplete({
        model:      AI_MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: buildSystemPrompt(config, options.isBuyerFacing ?? false, vertical) },
          { role: 'user', content: buildUserPrompt(theme, config, batchSize) },
        ],
      })

      const raw = response.choices[0]?.message?.content ?? '[]'
      // Strip markdown code fences if present
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      scripts = JSON.parse(text)
      if (!Array.isArray(scripts)) scripts = []
    } catch (err) {
      console.error('[draftGenerator] Generation failed for theme', theme.theme, err)
      continue
    }

    // Insert into DB
    const rows = scripts.slice(0, batchSize).map(s => ({
      org_id:           orgId,
      topic:            s.topic,
      tagline:          s.tagline ?? null,
      slides:           s.slides,
      cta_text:         s.cta_text,
      content_theme:    theme.theme,
      background_tags:  theme.tags,
      platform_targets: ['instagram', 'tiktok'],
    }))

    if (rows.length === 0) continue

    const { data, error } = await supabase
      .from('content_drafts')
      .insert(rows)
      .select()

    if (error) {
      console.error('[draftGenerator] DB insert failed:', error.message)
      continue
    }

    allDrafts.push(...(data as ContentDraft[]))
  }

  return allDrafts
}
