import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  // Auth client: RLS enforces org isolation for duplicate-check queries on vehicles.
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)

  const vin = searchParams.get('vin')?.trim().toUpperCase()
  const year = searchParams.get('year')
  const make = searchParams.get('make')?.trim()
  const model = searchParams.get('model')?.trim()

  let matches: Record<string, unknown>[] = []

  // 1. Exact VIN match — highest confidence
  if (vin && vin.length === 17) {
    const { data } = await supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, trim, status, vin, mileage, price')
      .eq('user_id', profile.org_id)
      .eq('vin', vin)
      .limit(3)
    if (data?.length) {
      matches = data.map(v => ({ ...v, match_type: 'vin' }))
    }
  }

  // 2. Fuzzy year+make+model fallback if no VIN match
  if (!matches.length && year && make && model) {
    const { data } = await supabase
      .from('vehicles')
      .select('id, stock_no, year, make, model, trim, status, vin, mileage, price')
      .eq('user_id', profile.org_id)
      .eq('year', parseInt(year))
      .ilike('make', `%${make}%`)
      .ilike('model', `%${model}%`)
      .limit(3)
    if (data?.length) {
      matches = data.map(v => ({ ...v, match_type: 'ymm' }))
    }
  }

  return NextResponse.json({ matches })
}
