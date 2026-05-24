import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export interface WantListCustomer {
  customer_id: string
  customer_name: string
  primary_phone: string | null
  last_outbound_at: string | null
  last_inbound_at: string | null
  wants: {
    id: string
    year_min: number | null
    year_max: number | null
    make: string | null
    model: string | null
    body_style: string | null
    max_price: number | null
    notes: string | null
    created_at: string
  }[]
}

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicle_wants')
    .select(`
      id, year_min, year_max, make, model, body_style, max_price, notes, created_at,
      customer:customers!vehicle_wants_customer_id_fkey(
        id, name, primary_phone, archived, last_outbound_at, last_inbound_at
      )
    `)
    .eq('user_id', profile.org_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json([], { status: 200 })

  // Group by customer, skip archived
  const byCustomer = new Map<string, WantListCustomer>()
  for (const row of data ?? []) {
    const cust = Array.isArray(row.customer) ? row.customer[0] : row.customer
    if (!cust || cust.archived) continue
    const existing = byCustomer.get(cust.id)
    const want = {
      id: row.id,
      year_min: row.year_min,
      year_max: row.year_max,
      make: row.make,
      model: row.model,
      body_style: row.body_style,
      max_price: row.max_price,
      notes: row.notes,
      created_at: row.created_at,
    }
    if (existing) {
      existing.wants.push(want)
    } else {
      byCustomer.set(cust.id, {
        customer_id: cust.id,
        customer_name: cust.name,
        primary_phone: cust.primary_phone,
        last_outbound_at: cust.last_outbound_at,
        last_inbound_at: cust.last_inbound_at,
        wants: [want],
      })
    }
  }

  // Sort: never-contacted first, then by oldest last outreach
  const result = Array.from(byCustomer.values()).sort((a, b) => {
    const aContact = a.last_outbound_at ?? a.last_inbound_at
    const bContact = b.last_outbound_at ?? b.last_inbound_at
    if (!aContact && !bContact) return 0
    if (!aContact) return -1
    if (!bContact) return 1
    return new Date(aContact).getTime() - new Date(bContact).getTime()
  })

  return NextResponse.json(result)
}
