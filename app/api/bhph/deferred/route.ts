import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessBhph } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canAccessBhph(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()

  let body: { bhph_id?: string; amount?: number | string; due_date?: string; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const bhphId = String(body.bhph_id ?? '')
  const amount = typeof body.amount === 'number' ? body.amount : parseFloat(String(body.amount ?? '0'))
  const dueDate = String(body.due_date ?? '')
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null

  if (!bhphId || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json({ error: 'bhph_id, amount, and due_date are required' }, { status: 400 })
  }

  const { data: contract } = await supabase
    .from('bhph_payments')
    .select('id, vehicle_id, customer_id, required_down_payment, down_payment')
    .eq('id', bhphId)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  const { data: existingRows } = await supabase
    .from('bhph_deferred_payments')
    .select('amount, status')
    .eq('bhph_id', contract.id)
    .eq('user_id', profile.org_id)

  const requiredDown = Number(contract.required_down_payment ?? 0)
  const collectedDown = Number(contract.down_payment ?? 0)
  const remainingTarget = Math.max(0, Math.round((requiredDown - collectedDown) * 100) / 100)
  const committed = Math.round(((existingRows ?? [])
    .filter(row => row.status !== 'cancelled')
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0) + amount) * 100) / 100

  if (remainingTarget <= 0) {
    return NextResponse.json({ error: 'This contract has no deferred down payment balance remaining' }, { status: 409 })
  }
  if (committed - remainingTarget > 0.01) {
    return NextResponse.json({ error: 'Installments exceed the remaining deferred down payment balance' }, { status: 409 })
  }

  const { data: installment, error } = await supabase
    .from('bhph_deferred_payments')
    .insert({
      user_id: profile.org_id,
      bhph_id: contract.id,
      vehicle_id: contract.vehicle_id,
      customer_id: contract.customer_id,
      amount: Math.round(amount * 100) / 100,
      due_date: dueDate,
      notes,
      status: 'scheduled',
      reminder_sequence_status: 'active',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ installment }, { status: 201 })
}
