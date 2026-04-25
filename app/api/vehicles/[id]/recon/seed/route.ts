import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessLedger } from '@/lib/auth/dealerRoles'
import { DEFAULT_RECON_CHECKLIST } from '@/lib/recon/defaults'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessLedger(profile.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  // Auth client: RLS enforces org isolation for vehicle check, org_settings read, and recon_checklist_items seed INSERT.
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Idempotency guard
  const { data: existing } = await supabase
    .from('recon_checklist_items')
    .select('id')
    .eq('vehicle_id', id)
    .eq('org_id', profile.org_id)
    .limit(1)

  if (existing && existing.length > 0) {
    const { data: items } = await supabase
      .from('recon_checklist_items')
      .select('*')
      .eq('vehicle_id', id)
      .eq('org_id', profile.org_id)
      .order('sort_order')
    return NextResponse.json({ items: items ?? [], seeded: false })
  }

  // Get org template or use defaults
  const { data: settings } = await supabase
    .from('org_settings')
    .select('recon_checklist_template')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const template = (settings?.recon_checklist_template as typeof DEFAULT_RECON_CHECKLIST | null) ?? DEFAULT_RECON_CHECKLIST

  const rows = template.map(t => ({
    vehicle_id: id,
    org_id: profile.org_id,
    label: t.label,
    is_required: t.is_required,
    sort_order: t.sort_order,
    category: (t as { category?: string }).category ?? 'standard',
  }))

  const { data: items, error } = await supabase
    .from('recon_checklist_items')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: 'Seed failed' }, { status: 500 })

  return NextResponse.json({ items: items ?? [], seeded: true })
}
