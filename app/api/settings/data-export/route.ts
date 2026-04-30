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

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { orgDataExportLimiter } from '@/lib/rateLimit/upstash'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { createServiceClient } from '@/lib/supabase/service'
import JSZip from 'jszip'

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

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role)) {
    return NextResponse.json({ error: 'Only admins can export dealership data.' }, { status: 403 })
  }
  const orgId   = profile.org_id

  const exportLimit = await orgDataExportLimiter(orgId)
  if (!exportLimit.allowed) {
    const waitMins = Math.max(1, Math.ceil(exportLimit.retryAfterSeconds / 60))
    return NextResponse.json(
      { error: `You can export your data once per day. Please wait ${waitMins} more minute${waitMins !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  const supabase = createServiceClient()

  // ✓ Verified 2026-04-29: all exported tables are org-scoped via user_id (customers, activities, templates) or org_id (vehicles)
  // Service client is acceptable here because queries are explicitly filtered by org before returning data.

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

  const zip = new JSZip()
  zip.file('customers.csv',  toCSV((customers  ?? []) as Record<string, unknown>[]))
  zip.file('vehicles.csv',   toCSV((vehicles   ?? []) as Record<string, unknown>[]))
  zip.file('activities.csv', toCSV((activities ?? []) as Record<string, unknown>[]))
  zip.file('templates.csv',  toCSV((templates  ?? []) as Record<string, unknown>[]))

  const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const ab     = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  void logOrgAudit({ org_id: orgId, actor_id: profile.id, actor_type: 'user', action: 'data_export',
    ip, details: { tables: ['customers', 'vehicles', 'activities', 'templates'] } })

  return new NextResponse(ab as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="dealerwyze-export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  })
}
