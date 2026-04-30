'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Check, Lock, Palette, Type, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { THEME_PRESETS, FONT_STYLES, buildThemeVars, getPreset, softenForDark } from '@/lib/theme/presets'

interface Props {
  initialPreset:  string
  initialPrimary: string | null
  initialAccent:  string | null
  initialFont:    string
  isPaid:         boolean
  plan:           string
}

export default function AppearanceClient({
  initialPreset,
  initialPrimary,
  initialAccent,
  initialFont,
  isPaid,
  plan,
}: Props) {
  void plan
  const [preset,    setPreset]    = useState(initialPreset)
  const [primary,   setPrimary]   = useState(initialPrimary ?? '#0D2B55')
  const [accent,    setAccent]    = useState(initialAccent  ?? '#F07018')
  const [fontStyle, setFontStyle] = useState(initialFont)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Derive preview colors from current selection
  const previewPrimary = preset === 'custom' ? primary : getPreset(preset).primary
  const previewAccent  = preset === 'custom' ? accent  : getPreset(preset).accent
  const previewDarkAccent = softenForDark(previewAccent)

  // Apply live preview to the page via a temporary style tag
  useEffect(() => {
    const vars = buildThemeVars(previewPrimary, previewAccent)
    const style = document.getElementById('theme-preview-style') ?? document.createElement('style')
    style.id = 'theme-preview-style'
    const lightVars = Object.entries(vars.light).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    const darkVars  = Object.entries(vars.dark).map(([k, v]) => `  ${k}: ${v};`).join('\n')
    style.innerHTML = `:root { ${lightVars} } .dark { ${darkVars} }`
    if (!style.parentNode) document.head.appendChild(style)
    return () => {
      // cleanup on unmount — revert preview
      style.innerHTML = ''
    }
  }, [previewPrimary, previewAccent])

  // Apply live font style preview by injecting heading font overrides
  useEffect(() => {
    const fontVar =
      fontStyle === 'classic'  ? 'var(--font-classic)' :
      fontStyle === 'bold'     ? 'var(--font-bold-style)' :
                                 'var(--font-display)'
    const style = document.getElementById('font-preview-style') ?? document.createElement('style')
    style.id = 'font-preview-style'
    style.innerHTML = `body h1, body h2, body h3, body h4, body nav [class*="font-semibold"] { font-family: ${fontVar} !important; }`
    if (!style.parentNode) document.head.appendChild(style)
    return () => { style.innerHTML = '' }
  }, [fontStyle])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/settings/appearance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme_preset:     preset,
          theme_primary:    preset === 'custom' ? primary : undefined,
          theme_accent:     preset === 'custom' ? accent  : undefined,
          theme_font_style: fontStyle,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!isPaid) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="font-semibold text-base">Theme customization is a paid feature</p>
          <p className="text-sm text-muted-foreground">
            Personalize your CRM with your dealership colors and style on the Growth or Pro plan.
          </p>
          <Button asChild className="mt-2">
            <Link href="/settings/billing">Upgrade your plan</Link>
          </Button>
        </div>
        {/* Show a read-only preview of what they'd get */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 opacity-50 pointer-events-none">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview (locked)</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PRESETS.map(p => (
              <div key={p.key} className="rounded-lg overflow-hidden border border-border h-14" style={{ background: p.preview }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Live preview strip */}
      <div className="rounded-xl overflow-hidden border border-border">
        <div className="px-4 py-2 border-b border-border bg-muted flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live preview</span>
        </div>
        <div className="p-4 space-y-3" style={{ background: 'var(--background)' }}>
          {/* Mini UI preview */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ background: previewPrimary }}>DW</div>
            <div className="flex-1">
              <div className="h-2 rounded-full w-24 mb-1" style={{ background: previewPrimary, opacity: 0.8 }} />
              <div className="h-1.5 rounded-full w-16" style={{ background: 'var(--muted)' }} />
            </div>
            <div className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ background: previewAccent }}>Button</div>
          </div>
          <div className="flex gap-2">
            <div className="px-2 py-1 rounded-full text-xs font-semibold text-white" style={{ background: previewAccent }}>New lead</div>
            <div className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>Pending</div>
            <div className="px-2 py-1 rounded-full text-xs font-semibold text-white" style={{ background: previewPrimary }}>Active</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Dark mode accent:</span>
            <span className="px-2 py-0.5 rounded text-white text-xs" style={{ background: previewDarkAccent }}>{previewDarkAccent}</span>
            <span className="text-[10px]">(auto-softened)</span>
          </div>
        </div>
      </div>

      {/* Preset picker */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Color theme</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEME_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
                preset === p.key ? 'border-primary' : 'border-border hover:border-muted-foreground'
              }`}
            >
              {/* Color swatch */}
              <div className="h-12 w-full" style={{ background: p.preview }} />
              <div className="p-2 bg-card">
                <p className="text-xs font-semibold leading-tight">{p.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{p.description}</p>
              </div>
              {preset === p.key && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              )}
            </button>
          ))}

          {/* Custom option */}
          <button
            onClick={() => setPreset('custom')}
            className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
              preset === 'custom' ? 'border-primary' : 'border-border hover:border-muted-foreground'
            }`}
          >
            <div className="h-12 w-full flex items-center justify-center"
              style={{ background: preset === 'custom'
                ? `linear-gradient(135deg, ${primary} 50%, ${accent} 100%)`
                : 'linear-gradient(135deg, #888 50%, #aaa 100%)' }}>
              <span className="text-white text-xs font-bold">Custom</span>
            </div>
            <div className="p-2 bg-card">
              <p className="text-xs font-semibold leading-tight">Custom colors</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">Pick your own</p>
            </div>
            {preset === 'custom' && (
              <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
          </button>
        </div>

        {/* Custom color pickers */}
        {preset === 'custom' && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Primary color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primary}
                  onChange={e => setPrimary(e.target.value)}
                  className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={primary}
                  onChange={e => setPrimary(e.target.value)}
                  maxLength={7}
                  className="flex-1 border border-input rounded-lg px-3 py-2 text-sm font-mono bg-background"
                  placeholder="#0D2B55"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Accent color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accent}
                  onChange={e => setAccent(e.target.value)}
                  className="h-9 w-12 rounded border border-border cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={accent}
                  onChange={e => setAccent(e.target.value)}
                  maxLength={7}
                  className="flex-1 border border-input rounded-lg px-3 py-2 text-sm font-mono bg-background"
                  placeholder="#F07018"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Font style picker */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Type className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Font style</p>
        </div>
        <div className="space-y-2">
          {FONT_STYLES.map(f => (
            <button
              key={f.key}
              onClick={() => setFontStyle(f.key)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all ${
                fontStyle === f.key ? 'border-primary bg-accent' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-2xl font-semibold leading-none w-10 text-center flex-shrink-0"
                  style={{ fontFamily: `var(--font-${f.key === 'bold' ? 'bold-style' : f.key === 'modern' ? 'display' : 'classic'})` }}
                >
                  Aa
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                </div>
              </div>
              {fontStyle === f.key && (
                <Check className="h-4 w-4 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save appearance'}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Changes apply to your dealership account only. DealerWyze branding is always shown.
      </p>
    </div>
  )
}
