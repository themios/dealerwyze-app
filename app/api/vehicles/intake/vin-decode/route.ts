import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i

export async function POST(req: NextRequest) {
  await requireProfile() // auth check only — no org data needed for NHTSA lookup

  const body = await req.json()
  const raw = body?.vin
  if (!raw || !VIN_REGEX.test(String(raw).trim())) {
    return NextResponse.json({ error: 'Invalid VIN' }, { status: 400 })
  }
  const cleanVin = String(raw).trim().toUpperCase()

  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${cleanVin}?format=json`,
    { next: { revalidate: 86400 } } // cache 24h — VIN data never changes
  )
  if (!res.ok) return NextResponse.json({ error: 'VIN lookup failed' }, { status: 502 })

  const data = await res.json()
  const r = data?.Results?.[0]
  if (!r || r.ErrorCode !== '0') {
    return NextResponse.json({ error: 'VIN not found' }, { status: 404 })
  }

  return NextResponse.json({
    vin: cleanVin,
    year: r.ModelYear ? parseInt(r.ModelYear) : null,
    make: r.Make || null,
    model: r.Model || null,
    trim: r.Trim || null,
    body_type: r.BodyClass || null,
    fuel_type: r.FuelTypePrimary || null,
    engine: r.DisplacementL ? `${parseFloat(r.DisplacementL).toFixed(1)}L` : null,
  })
}
