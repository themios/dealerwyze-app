import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { assertCanUseFeature, BillingError } from '@/lib/billing/assertFeature'
import { extractVehicleFromPastedText } from '@/lib/vehicles/pasteExtract'

export const maxDuration = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await assertCanUseFeature(profile.org_id, 'ai_scan')
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: err.message }, { status: 402 })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { text?: string }
  const text = body.text?.trim() ?? ''

  if (text.length < 40) {
    return NextResponse.json(
      { error: 'Paste more page content so AI has enough context to identify the vehicle.' },
      { status: 400 },
    )
  }

  try {
    const extracted = await extractVehicleFromPastedText(text)
    if (!extracted.vin && !extracted.year && !extracted.make && !extracted.model) {
      return NextResponse.json(
        { error: 'Could not identify a vehicle from that pasted content.' },
        { status: 422 },
      )
    }
    return NextResponse.json(extracted)
  } catch (err) {
    console.error('[vehicles/intake/parse-text] error:', err)
    const msg = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
