/**
 * GET /api/settings/data-export
 * Returns a ZIP containing:
 *   - customers.csv
 *   - vehicles.csv
 *   - activities.csv
 *   - templates.csv
 *
 * Rate-limited to once per 24 hours per org.
 * Scoped to the authenticated user's org only.
 */

import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import JSZip from 'jszip'

const EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours

// In-process cooldown — prevents repeated large exports. One per org per day is plenty.
const lastExport = new Map<string, number>()

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v).replace(/"/g, '""')
    return /[,"\n\r]/.test(s) ? `"${s}"` : s
  }
  const header = cols.join(',')
  const body   = rows.map(r => cols.map(c => escape(r[c])).join(',')).join('\n')
  return `${header}\n${body}`
}

export async function GET() {
  const profile = await requireProfile()
  const orgId   = profile.org_id

  // Cooldown: one export per org per 24 hours
  const last = lastExport.get(orgId)
  if (last && Date.now() - last < EXPORT_COOLDOWN_MS) {
    const waitMins = Math.ceil((EXPORT_COOLDOWN_MS - (Date.now() - last)) / 60000)
    return NextResponse.json(
      { error: `You can export your data once per day. Please wait ${waitMins} more minute${waitMins !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  const supabase = createServiceClient()

  // Customers — use user_id for org scoping (no org_id column)
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, primary_phone, email, address, city, state, birthday, last_service_date, created_at')
    .or(`user_id.eq.${orgId},user_id.eq.${profile.id}`)
    .order('created_at', { ascending: true })
    .limit(10000)

  // Vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, year, make, model, trim, vin, mileage, price, status, color, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(10000)

  // Activities — user_id = org_id in this table
  const { data: activities } = await supabase
    .from('activities')
    .select('id, customer_id, type, direction, body, completed_at, created_at')
    .eq('user_id', orgId)
    .neq('body', '__sequence_sent__')
    .order('created_at', { ascending: true })
    .limit(50000)

  // Templates
  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, channel, category, body, created_at')
    .eq('user_id', orgId)
    .order('created_at', { ascending: true })
    .limit(5000)

  lastExport.set(orgId, Date.now())

  const zip = new JSZip()
  zip.file('customers.csv',  toCSV((customers  ?? []) as Record<string, unknown>[]))
  zip.file('vehicles.csv',   toCSV((vehicles   ?? []) as Record<string, unknown>[]))
  zip.file('activities.csv', toCSV((activities ?? []) as Record<string, unknown>[]))
  zip.file('templates.csv',  toCSV((templates  ?? []) as Record<string, unknown>[]))

  const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const ab     = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  return new NextResponse(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="dealerwyze-export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  })
}
