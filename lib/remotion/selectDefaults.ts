import { VideoTemplate, OrgVideoSettings } from './types'

interface VehicleForDefaults {
  photos?: string[] | null
  price?: number | null
  make?: string
  model?: string
}

/**
 * Select up to 8 photos for the video.
 * If overrides provided, use those (trimmed to 8).
 * Otherwise use vehicle photos as-is (ordered by upload, hero shot first).
 */
export function selectPhotos(vehicle: VehicleForDefaults, overrides?: string[]): string[] {
  if (overrides && overrides.length > 0) {
    return overrides.slice(0, 8)
  }
  return (vehicle.photos ?? []).filter(Boolean).slice(0, 8)
}

/**
 * Select template based on:
 * 1. Org's saved favorite (first in list)
 * 2. Price-based default
 */
export function selectTemplate(
  vehicle: VehicleForDefaults,
  orgSettings: OrgVideoSettings | null,
  templates: VideoTemplate[],
  overrideTemplateId?: string,
): VideoTemplate | null {
  if (!templates.length) return null

  // Override from request
  if (overrideTemplateId) {
    const t = templates.find(t => t.id === overrideTemplateId)
    if (t) return t
  }

  // Org favorite
  if (orgSettings?.favorite_template_ids?.length) {
    const fav = templates.find(t => t.id === orgSettings.favorite_template_ids[0])
    if (fav) return fav
  }

  // Price-based default
  const price = vehicle.price ?? 0
  if (price >= 30000) {
    const t = templates.find(t => t.composition_id === 'VehicleModernDark')
    if (t) return t
  }
  if (price >= 15000) {
    const t = templates.find(t => t.composition_id === 'VehicleModernDark')
    if (t) return t
  }

  // Default: Slideshow for lower-priced vehicles
  const slideshow = templates.find(t => t.composition_id === 'VehiclePhotoSlideshow')
  if (slideshow) return slideshow

  return templates[0]
}

/**
 * Select voice from org settings or return the platform default.
 */
export function selectVoice(orgSettings: OrgVideoSettings | null, override?: string): string {
  if (override) return override
  return orgSettings?.default_voice ?? 'en-US-Studio-Q'
}

export const VOICE_OPTIONS = [
  { value: 'en-US-Studio-Q', label: 'Natural Male (Default)' },
  { value: 'en-US-Studio-O', label: 'Natural Female' },
  { value: 'en-US-Neural2-D', label: 'Deep Male' },
  { value: 'en-US-Neural2-F', label: 'Clear Female' },
]
