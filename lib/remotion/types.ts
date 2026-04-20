// Shared types for video rendering. Keep in sync with remotion/types.ts.

export interface VehicleVideoProps {
  // Dealer branding
  dealerName: string
  dealerCity: string
  dealerState: string
  dealerPhone: string
  dealerWebsite?: string
  dealerLogoUrl?: string
  dealerTagline?: string

  // Vehicle data
  year: number
  make: string
  model: string
  trim?: string
  price: number
  mileage: number
  color?: string
  interior?: string
  vin?: string
  engine?: string
  mpgCity?: number
  mpgHwy?: number
  isSalvage: boolean
  photos: string[]
  features: string[]

  // Narration
  narrationUrl?: string

  // Display flags
  showPrice: boolean
  showPhone: boolean
  showWatermark: boolean
}

export interface VideoTemplate {
  id: string
  name: string
  description: string | null
  composition_id: string
  thumbnail_url: string
  aspect_ratio: string
  duration_seconds: number
  best_for: string[]
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface OrgVideoSettings {
  org_id: string
  favorite_template_ids: string[]
  default_voice: string
  auto_post_on_listing: boolean
  auto_post_platforms: string[]
  caption_template: string | null
  include_price: boolean
  include_phone: boolean
  watermark_enabled: boolean
  render_quota_used: number
  render_quota_reset_at: string
}

export interface VideoRender {
  id: string
  org_id: string
  vehicle_id: string
  template_id: string
  status: 'queued' | 'rendering' | 'complete' | 'failed'
  aspect_ratio: string
  output_url: string | null
  narration_url: string | null
  lambda_render_id: string | null
  triggered_by: 'auto' | 'manual'
  triggered_by_user: string | null
  error_message: string | null
  props_snapshot: VehicleVideoProps | null
  selected_photo_urls: string[] | null
  voice_name: string | null
  created_at: string
  completed_at: string | null
}
