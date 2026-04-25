// DealerWyze per-org theme system
// Presets + HSL auto-soften for dark mode

export type FontStyle = 'modern' | 'classic' | 'bold'

export interface ThemePreset {
  key: string
  name: string
  description: string
  primary: string   // light mode primary (hex)
  accent: string    // light mode accent (hex)
  preview: string   // preview gradient for the picker card (CSS gradient)
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'dealerwyze',
    name: 'DealerWyze',
    description: 'Warm navy + orange — the default',
    primary: '#0D2B55',
    accent:  '#F07018',
    preview: 'linear-gradient(135deg, #0D2B55 50%, #F07018 100%)',
  },
  {
    key: 'midnight',
    name: 'Midnight',
    description: 'Dark luxury with crimson',
    primary: '#1A1A2E',
    accent:  '#E94560',
    preview: 'linear-gradient(135deg, #1A1A2E 50%, #E94560 100%)',
  },
  {
    key: 'american-red',
    name: 'American Red',
    description: 'Bold, classic dealership red',
    primary: '#B71C1C',
    accent:  '#1A237E',
    preview: 'linear-gradient(135deg, #B71C1C 50%, #1A237E 100%)',
  },
  {
    key: 'clean-green',
    name: 'Clean Green',
    description: 'Fresh and approachable',
    primary: '#1A5276',
    accent:  '#27AE60',
    preview: 'linear-gradient(135deg, #1A5276 50%, #27AE60 100%)',
  },
  {
    key: 'premium-black',
    name: 'Premium Black',
    description: 'High-end with gold accent',
    primary: '#1C1C1C',
    accent:  '#D4AF37',
    preview: 'linear-gradient(135deg, #1C1C1C 50%, #D4AF37 100%)',
  },
  {
    key: 'sky-blue',
    name: 'Sky Blue',
    description: 'Friendly and trustworthy',
    primary: '#1565C0',
    accent:  '#FF8F00',
    preview: 'linear-gradient(135deg, #1565C0 50%, #FF8F00 100%)',
  },
]

export const FONT_STYLES: { key: FontStyle; name: string; description: string; bodyClass: string }[] = [
  {
    key: 'modern',
    name: 'Modern',
    description: 'Archivo + Barlow — clean and contemporary',
    bodyClass: 'font-modern',
  },
  {
    key: 'classic',
    name: 'Classic',
    description: 'Lora serif headings — traditional authority',
    bodyClass: 'font-classic',
  },
  {
    key: 'bold',
    name: 'Bold',
    description: 'Oswald headings — strong and sporty',
    bodyClass: 'font-bold-style',
  },
]

// --- Color utilities ---

/** Parse a hex string to [r, g, b] 0-255 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

/** Convert [r,g,b] 0-255 to [h 0-360, s 0-100, l 0-100] */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

/** Convert [h, s, l] to hex string */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Auto-soften a color for dark mode:
 * - Cap saturation at 65% (removes harsh intensity)
 * - Boost lightness to 62% (ensures readability on dark bg)
 * Preserves hue so the color is still recognizable.
 */
export function softenForDark(hex: string): string {
  try {
    const [r, g, b] = hexToRgb(hex)
    const [h, s, l] = rgbToHsl(r, g, b)
    const darkS = Math.min(s, 65)
    const darkL = Math.max(l, 58) // ensure it's light enough on dark bg
    const cappedL = Math.min(darkL, 72) // don't go too washed out
    return hslToHex(h, darkS, cappedL)
  } catch {
    return hex
  }
}

/**
 * Derive all CSS variable overrides for an org's theme.
 * Returns an object of CSS var name → value for both light and dark.
 */
export interface ThemeVars {
  light: Record<string, string>
  dark: Record<string, string>
}

export function buildThemeVars(primary: string, accent: string): ThemeVars {
  const darkPrimary = softenForDark(primary)
  const darkAccent  = softenForDark(accent)

  // Derive a light accent tint (10% opacity primary for light bg)
  const [pr, pg, pb] = hexToRgb(primary)
  const accentTint = `rgba(${pr}, ${pg}, ${pb}, 0.08)`

  const [ar, ag, ab] = hexToRgb(accent)
  const accentFg = `rgba(${ar}, ${ag}, ${ab}, 0.85)`

  return {
    light: {
      '--primary':            primary,
      '--primary-foreground': '#FFFFFF',
      '--ring':               primary,
      '--sidebar-primary':    primary,
      '--sidebar-ring':       primary,
      '--accent':             accentTint,
      '--accent-foreground':  accentFg,
      '--brand-orange':       accent,
      '--chart-1':            accent,
      '--chart-3':            primary,
    },
    dark: {
      '--primary':            darkAccent,  // accent becomes primary in dark (orange→accent pattern)
      '--primary-foreground': '#FFFFFF',
      '--ring':               darkAccent,
      '--sidebar-primary':    darkAccent,
      '--sidebar-ring':       darkAccent,
      '--accent':             `rgba(${hexToRgb(darkPrimary).join(',')}, 0.15)`,
      '--accent-foreground':  darkAccent,
      '--brand-orange':       darkAccent,
      '--chart-1':            darkAccent,
      '--chart-3':            darkPrimary,
    },
  }
}

export function getPreset(key: string): ThemePreset {
  return THEME_PRESETS.find(p => p.key === key) ?? THEME_PRESETS[0]
}
