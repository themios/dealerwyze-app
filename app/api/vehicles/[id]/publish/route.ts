/**
 * PATCH /api/vehicles/[id]/publish
 * Toggle vehicle public visibility. Auto-generates public_slug on first publish.
 * Dealer admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/types/index'
import { generatePublicSlug } from '@/lib/vdp/generateSlug'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()

  if (!isDealerAdmin(profile.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { id } = await params
  const { published } = await req.json()

  if (typeof published !== 'boolean') {
    return NextResponse.json({ error: 'published must be boolean' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch vehicle to generate slug if needed
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim, stock_no, public_slug, user_id')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = { published }

  // Auto-generate slug on first publish
  if (published && !vehicle.public_slug) {
    const slug = generatePublicSlug({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      stock_no: vehicle.stock_no ?? id.slice(0, 8),
    })
    updates.public_slug = slug
  }

  const { error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, public_slug: updates.public_slug ?? vehicle.public_slug })
}
