/**
 * GET /api/settings/data-export
 * GDPR right to portability: returns a ZIP containing comprehensive org data export.
 *
 * Tables included:
 *   - org_settings.csv (org metadata)
 *   - customers.csv (all contacts)
 *   - vehicles.csv (all vehicles/inventory)
 *   - activities.csv (all interactions)
 *   - templates.csv (message templates)
 *   - tasks.csv (task history)
 *   - sequences.csv (message sequences)
 *   - customer_sequences.csv (enrollment history)
 *   - support_tickets.csv (support history)
 *   - voice_calls.csv (call history)
 *   - receipts.csv (BHPH/payment records)
 *   - export-metadata.json (export summary, GDPR compliance info)
 *
 * Rate-limited to once per hour per org (Upstash Redis).
 * Requires admin role. Scoped to authenticated org only.
 * Comprehensive audit logging: data_export action with table count and record count.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import { orgExportLimiter } from '@/lib/rateLimit/upstash'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { writeAuditLog } from '@/lib/audit/log'
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
    return NextResponse.json({ error: 'Only admins can export data. Contact your organization owner.' }, { status: 403 })
  }
  const orgId   = profile.org_id

  const exportLimit = await orgExportLimiter(orgId)
  if (!exportLimit.allowed) {
    const waitMins = Math.max(1, Math.ceil(exportLimit.retryAfterSeconds / 60))
    return NextResponse.json(
      { error: `Data export is rate-limited to once per hour per organization. Please try again in ${waitMins} minute${waitMins !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  const supabase = createServiceClient()
  const exportDate = new Date()
  const tableNames: string[] = []
  let totalRecords = 0

  try {
    // Org settings (metadata only, no PII)
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('org_id, sms_phone_number, website_url, timezone, language, created_at, updated_at')
      .eq('org_id', orgId)
      .maybeSingle()

    // Customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, primary_phone, email, address, city, state, zip, birthday, last_service_date, source, status, created_at, updated_at')
      .or(`user_id.eq.${orgId},user_id.eq.${profile.id}`)
      .order('created_at', { ascending: true })
      .limit(10000)

    // Vehicles (scoped by user_id = org, not org_id; migration 195 note)
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, year, make, model, trim, vin, mileage, price, status, color, interior_color, body_type, transmission, fuel_type, created_at, updated_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: true })
      .limit(10000)

    // Activities
    const { data: activities } = await supabase
      .from('activities')
      .select('id, customer_id, type, direction, channel, body, completed_at, created_at')
      .eq('user_id', orgId)
      .neq('body', '__sequence_sent__')
      .order('created_at', { ascending: true })
      .limit(50000)

    // Templates
    const { data: templates } = await supabase
      .from('templates')
      .select('id, name, channel, category, body, created_at, updated_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: true })
      .limit(5000)

    // Tasks
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, customer_id, title, description, status, priority, due_date, completed_at, created_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: true })
      .limit(10000)

    // Sequences
    const { data: sequences } = await supabase
      .from('sequences')
      .select('id, name, channel, description, status, created_at, updated_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1000)

    // Customer sequences (enrollment/participation)
    const { data: customerSequences } = await supabase
      .from('customer_sequences')
      .select('id, customer_id, sequence_id, status, started_at, completed_at, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(10000)

    // Support tickets
    const { data: supportTickets } = await supabase
      .from('support_tickets')
      .select('id, subject, description, status, priority, created_at, resolved_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(5000)

    // Voice calls
    const { data: voiceCalls } = await supabase
      .from('voice_calls')
      .select('id, customer_id, phone_number, duration_seconds, status, recording_url, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(5000)

    // BHPH receipts/payments (if applicable)
    const { data: receipts } = await supabase
      .from('receipts')
      .select('id, customer_id, amount, payment_method, status, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(10000)

    // Build ZIP
    const zip = new JSZip()

    // Add each CSV file
    if (orgSettings) {
      zip.file('org-settings.csv', toCSV([orgSettings]))
      tableNames.push('org_settings')
      totalRecords += 1
    }

    const csvTables = [
      { name: 'customers', data: customers },
      { name: 'vehicles', data: vehicles },
      { name: 'activities', data: activities },
      { name: 'templates', data: templates },
      { name: 'tasks', data: tasks },
      { name: 'sequences', data: sequences },
      { name: 'customer-sequences', data: customerSequences },
      { name: 'support-tickets', data: supportTickets },
      { name: 'voice-calls', data: voiceCalls },
      { name: 'receipts', data: receipts },
    ]

    for (const table of csvTables) {
      const rows = (table.data ?? []) as Record<string, unknown>[]
      if (rows.length > 0) {
        zip.file(`${table.name}.csv`, toCSV(rows))
        tableNames.push(table.name.replace('-', '_'))
        totalRecords += rows.length
      }
    }

    // Add GDPR metadata
    const metadata = {
      exportDate: exportDate.toISOString(),
      orgId: orgId,
      exportedBy: profile.id,
      totalTables: tableNames.length,
      totalRecords: totalRecords,
      tables: tableNames,
      gdprCompliance: {
        rightToData: 'This export represents all personal data held about your organization.',
        rightToDeletion: 'To request deletion of your data, contact support@dealerwyze.com',
        dataSecurity: 'This file contains sensitive business data. Keep it secure.',
        retention: 'Retain this file in accordance with your data retention policies.',
      },
    }

    zip.file('export-metadata.json', JSON.stringify(metadata, null, 2))

    const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    const ab     = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

    // Audit logging
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const exportSummary = {
      tables: tableNames,
      totalRecords,
      totalTables: tableNames.length,
    }

    void logOrgAudit({
      org_id: orgId,
      actor_id: profile.id,
      actor_type: 'user',
      action: 'data_export',
      ip,
      details: exportSummary,
    })

    void writeAuditLog({
      orgId: orgId,
      actorId: profile.id,
      actorType: 'user',
      action: 'data_export',
      metadata: exportSummary,
      ipAddress: ip,
    })

    return new NextResponse(ab as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="dealerwyze-data-export-${exportDate.toISOString().slice(0, 10)}.zip"`,
      },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    void writeAuditLog({
      orgId: orgId,
      actorId: profile.id,
      actorType: 'user',
      action: 'data_export',
      metadata: { status: 'failed', error: error.slice(0, 200) },
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })
    return NextResponse.json({ error: 'Failed to generate export. Please try again.' }, { status: 500 })
  }
}
