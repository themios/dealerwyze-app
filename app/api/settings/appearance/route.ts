import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'
import { THEME_PRESETS, FONT_STYLES } from '@/lib/theme/presets'
import type { FontStyle } from '@/lib/theme/presets'

const VALID_PRESETS  = new Set([...THEME_PRESETS.map(p => p.key), 'custom'])
const VALID_FONTS    = new Set(FONT_STYLES.map(f => f.key))
const HEX_RE         = /^#[0-9A-Fa-f]{6}$/

// Plans that can access theme customization
const ALLOWED_PLANS  = new Set(['growth', 'pro'])

function isFontStyle(value: string): value is FontStyle {
  return VALID_FONTS.has(value as FontStyle)
}

export async function GET() {
  const profile = await requireProfile()
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('org_settings')
    .select('theme_preset, theme_primary, theme_accent, theme_font_style')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return NextResponse.json({
    theme_preset:     data?.theme_preset     ?? 'dealerwyze',
    theme_primary:    data?.theme_primary     ?? null,
    theme_accent:     data?.theme_accent      ?? null,
    theme_font_style: data?.theme_font_style  ?? 'modern',
  })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Check plan gate
  const supabase = createServiceClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', profile.org_id)
    .single()

  const plan = (org?.plan ?? 'free').toLowerCase()
  if (!ALLOWED_PLANS.has(plan)) {
    return NextResponse.json(
      { error: 'Theme customization is available on Growth and Pro plans. Upgrade in Settings > Billing.' },
      { status: 403 }
    )
  }

  let body: { theme_preset?: string; theme_primary?: string; theme_accent?: string; theme_font_style?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const preset    = body.theme_preset     ?? 'dealerwyze'
  const primary   = body.theme_primary    ?? null
  const accent    = body.theme_accent     ?? null
  const fontStyle = body.theme_font_style ?? 'modern'

  if (!VALID_PRESETS.has(preset)) {
    return NextResponse.json({ error: 'Invalid theme preset' }, { status: 400 })
  }
  if (!isFontStyle(fontStyle)) {
    return NextResponse.json({ error: 'Invalid font style' }, { status: 400 })
  }
  if (preset === 'custom') {
    if (!primary || !HEX_RE.test(primary)) {
      return NextResponse.json({ error: 'Invalid primary color — must be a 6-digit hex (e.g. #C0392B)' }, { status: 400 })
    }
    if (!accent || !HEX_RE.test(accent)) {
      return NextResponse.json({ error: 'Invalid accent color — must be a 6-digit hex (e.g. #F07018)' }, { status: 400 })
    }
  }

  await supabase
    .from('org_settings')
    .update({
      theme_preset:     preset,
      theme_primary:    preset === 'custom' ? primary : null,
      theme_accent:     preset === 'custom' ? accent  : null,
      theme_font_style: fontStyle,
    })
    .eq('org_id', profile.org_id)

  return NextResponse.json({ saved: true })
}
