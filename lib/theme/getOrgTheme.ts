import { createServiceClient } from '@/lib/supabase/service'
import { buildThemeVars, getPreset, ThemeVars } from './presets'

export interface OrgTheme {
  preset: string
  primary: string
  accent: string
  fontStyle: string
  vars: ThemeVars
}

const DEFAULT_THEME: OrgTheme = {
  preset:    'dealerwyze',
  primary:   '#0D2B55',
  accent:    '#F07018',
  fontStyle: 'modern',
  vars:      { light: {}, dark: {} }, // empty = CSS defaults apply
}

/**
 * Fetch the theme for an org. Returns defaults if no customization set.
 * Safe to call from server components — uses service client.
 */
export async function getOrgTheme(orgId: string | null | undefined): Promise<OrgTheme> {
  if (!orgId) return DEFAULT_THEME

  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('org_settings')
      .select('theme_preset, theme_primary, theme_accent, theme_font_style')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!data) return DEFAULT_THEME

    const preset     = data.theme_preset    ?? 'dealerwyze'
    const fontStyle  = data.theme_font_style ?? 'modern'

    // Resolve colors: custom overrides preset
    let primary: string
    let accent: string

    if (preset === 'custom' && data.theme_primary && data.theme_accent) {
      primary = data.theme_primary
      accent  = data.theme_accent
    } else {
      const p = getPreset(preset)
      primary = p.primary
      accent  = p.accent
    }

    // Only build vars if non-default
    const isDefault = primary === '#0D2B55' && accent === '#F07018'
    const vars = isDefault ? { light: {}, dark: {} } : buildThemeVars(primary, accent)

    return { preset, primary, accent, fontStyle, vars }
  } catch {
    return DEFAULT_THEME
  }
}

/** Build an inline <style> string to inject theme vars into the page */
export function buildThemeStyleTag(vars: ThemeVars): string {
  const lightVars = Object.entries(vars.light).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  const darkVars  = Object.entries(vars.dark).map(([k, v]) => `  ${k}: ${v};`).join('\n')

  if (!lightVars && !darkVars) return ''

  return `
:root {
${lightVars}
}
.dark {
${darkVars}
}`.trim()
}
