import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

// GET /api/vehicle-wants?customer_id=xxx — list wants for a customer
export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const customerId = req.nextUrl.searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehicle_wants')
    .select('*')
    .eq('user_id', profile.org_id)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/vehicle-wants — create a new want entry
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const body = await req.json().catch(() => ({}))

  const {
    customer_id,
    year_min,
    year_max,
    make,
    model,
    body_style,
    max_price,
    notes,
  } = body

  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const validBodyStyles = ['pickup','suv','sedan','coupe','van','minivan','wagon','convertible','hatchback','other']
  if (body_style && !validBodyStyles.includes(body_style)) {
    return NextResponse.json({ error: 'Invalid body style' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify customer belongs to this org
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('vehicle_wants')
    .insert({
      user_id: profile.org_id,
      customer_id,
      year_min: year_min ? parseInt(year_min) : null,
      year_max: year_max ? parseInt(year_max) : null,
      make: make?.trim() || null,
      model: model?.trim() || null,
      body_style: body_style || null,
      max_price: max_price ? parseFloat(max_price) : null,
      notes: notes?.trim() || null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
