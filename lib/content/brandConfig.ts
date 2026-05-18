import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContentReelProps } from '@/lib/remotion/types'

export interface OrgBrandConfig {
  org_id:       string
  brand_name:   string
  brand_handle: string
  accent_color: string
  bg_color:     string
  website:      string | null
  logo_url:     string | null
  cta_images:   string[]
  voice:        string
  watermark:    boolean
}

export async function getOrgBrandConfig(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgBrandConfig | null> {
  const { data } = await supabase
    .from('content_brand_config')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle()

  return data ?? null
}

// Merge org brand config into render props — props passed explicitly take precedence
export function applyBrandConfig(
  props: Partial<ContentReelProps>,
  config: OrgBrandConfig | null,
): Partial<ContentReelProps> {
  if (!config) return props
  return {
    brandName:   props.brandName   ?? config.brand_name,
    brandHandle: props.brandHandle ?? config.brand_handle,
    accentColor: props.accentColor ?? config.accent_color,
    bgColor:     props.bgColor     ?? config.bg_color,
    website:     props.website     ?? config.website ?? undefined,
    logoUrl:     props.logoUrl     ?? config.logo_url ?? undefined,
    ctaImages:   props.ctaImages   ?? (config.cta_images.length ? config.cta_images : undefined),
    watermark:   props.watermark   ?? config.watermark,
    ...props,
  }
}

export async function upsertOrgBrandConfig(
  supabase: SupabaseClient,
  orgId: string,
  config: Partial<Omit<OrgBrandConfig, 'org_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('content_brand_config')
    .upsert({ org_id: orgId, ...config, updated_at: new Date().toISOString() })

  if (error) throw new Error(`Failed to save brand config: ${error.message}`)
}
