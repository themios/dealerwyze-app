/**
 * GET/PATCH /api/settings/bhph-payment-methods — BHPH reminder payment options (admin only).
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { isDealerAdmin } from '@/types/index'
import type { UserRole } from '@/types/index'

const PatchSchema = z.object({
  achPromptsEnabled:         z.boolean(),
  manualInstructionsEnabled: z.boolean(),
  zelleHandle:               z.string().max(100).transform(s => s.trim()),
  venmoHandle:               z.string().max(100).transform(s => s.trim()),
  cashappHandle:             z.string().max(100).transform(s => s.trim()),
})

export async function GET() {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('org_settings')
    .select(`
      bhph_zelle_handle, bhph_venmo_handle, bhph_cashapp_handle,
      bhph_manual_instructions_enabled, bhph_ach_prompts_enabled
    `)
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 })
  }

  return NextResponse.json({
    achPromptsEnabled:         data?.bhph_ach_prompts_enabled !== false,
    manualInstructionsEnabled: !!data?.bhph_manual_instructions_enabled,
    zelleHandle:               (data?.bhph_zelle_handle as string | null) ?? '',
    venmoHandle:               (data?.bhph_venmo_handle as string | null) ?? '',
    cashappHandle:             (data?.bhph_cashapp_handle as string | null) ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: z.infer<typeof PatchSchema>
  try {
    const raw: unknown = JSON.parse(await req.text())
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (body.manualInstructionsEnabled) {
    const anyHandle =
      body.zelleHandle.length > 0 ||
      body.venmoHandle.length > 0 ||
      body.cashappHandle.length > 0
    if (!anyHandle) {
      return NextResponse.json(
        { error: 'Add at least one Zelle, Venmo, or Cash App handle when manual instructions are enabled.' },
        { status: 400 },
      )
    }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('org_settings')
    .update({
      bhph_ach_prompts_enabled:         body.achPromptsEnabled,
      bhph_manual_instructions_enabled: body.manualInstructionsEnabled,
      bhph_zelle_handle:                body.zelleHandle || null,
      bhph_venmo_handle:                body.venmoHandle || null,
      bhph_cashapp_handle:              body.cashappHandle || null,
    })
    .eq('org_id', profile.org_id)

  if (error) {
    console.error('[settings/bhph-payment-methods]', error.message)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
