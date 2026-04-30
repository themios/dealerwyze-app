import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('bhph_deferred_payments')
    .select('id, user_id, customer_id, amount, bhph_id, status')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Installment not found' }, { status: 404 })

  let body: {
    amount?: number | string
    due_date?: string
    notes?: string | null
    status?: 'scheduled' | 'paid' | 'cancelled'
    paid_amount?: number | string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  const { data: contract } = await supabase
    .from('bhph_payments')
    .select('required_down_payment, down_payment')
    .eq('id', existing.bhph_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (body.amount !== undefined) {
    const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount))
    if (!(amount > 0)) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    const { data: siblingRows } = await supabase
      .from('bhph_deferred_payments')
      .select('id, amount, status')
      .eq('bhph_id', existing.bhph_id)
      .eq('user_id', profile.org_id)
    const requiredDown = Number(contract?.required_down_payment ?? 0)
    const collectedDown = Number(contract?.down_payment ?? 0)
    const remainingTarget = Math.max(0, Math.round((requiredDown - collectedDown) * 100) / 100)
    const committed = Math.round(((
      siblingRows ?? []
    ).filter(row => row.status !== 'cancelled' && row.id !== existing.id)
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0) + amount) * 100) / 100
    if (committed - remainingTarget > 0.01) {
      return NextResponse.json({ error: 'Installments exceed the remaining deferred down payment balance' }, { status: 409 })
    }
    patch.amount = Math.round(amount * 100) / 100
  }
  if (body.due_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)) {
      return NextResponse.json({ error: 'Invalid due_date' }, { status: 400 })
    }
    patch.due_date = body.due_date
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes ? String(body.notes).trim().slice(0, 500) : null
  }
  if (body.status !== undefined) {
    if (!['scheduled', 'paid', 'cancelled'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
    if (body.status === 'paid') {
      if (existing.status === 'paid') {
        const { data: current } = await supabase
          .from('bhph_deferred_payments')
          .select('*')
          .eq('id', id)
          .eq('user_id', profile.org_id)
          .single()
        return NextResponse.json({ installment: current, already_paid: true })
      }

      const paidAmount = body.paid_amount == null
        ? existing.amount
        : (typeof body.paid_amount === 'number' ? body.paid_amount : parseFloat(String(body.paid_amount)))
      patch.paid_amount = Math.round((paidAmount > 0 ? paidAmount : existing.amount) * 100) / 100
      patch.paid_at = new Date().toISOString()
      patch.reminder_sequence_status = 'completed'
      patch.last_reminder_type = null
      patch.last_reminder_at = null

      await supabase.from('activities').insert({
        user_id: profile.org_id,
        customer_id: existing.customer_id,
        type: 'note',
        direction: 'inbound',
        body: `Deferred down payment installment of $${patch.paid_amount} received.`,
        priority: 'normal',
        completed_at: new Date().toISOString(),
      })
    } else {
      patch.paid_amount = null
      patch.paid_at = null
      patch.reminder_sequence_status = body.status === 'cancelled' ? 'completed' : 'active'
      patch.last_reminder_type = null
      patch.last_reminder_at = null
    }
  }

  const { data: installment, error } = await supabase
    .from('bhph_deferred_payments')
    .update(patch)
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ installment })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('bhph_deferred_payments')
    .delete()
    .eq('id', id)
    .eq('user_id', profile.org_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
