import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { canAccessReports } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import * as XLSX from 'xlsx'

// Helper: unwrap PromiseSettledResult rows
function settled<T>(res: PromiseSettledResult<{ data: T[] | null }>): T[] {
  return res.status === 'fulfilled' ? (res.value.data ?? []) : []
}

export async function GET() {
  const profile = await requireProfile()
  if (!canAccessReports(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const orgId = profile.org_id

  const results = await Promise.allSettled([
    supabase
      .from('customers')
      .select('name, primary_phone, secondary_phone, email, lead_source, thread_state, tags, notes, first_response_at, response_time_seconds, created_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('vehicles')
      .select('stock_no, vin, year, make, model, trim, color, mileage, price, status, sold_price, sold_at, notes, created_at')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('activities')
      .select('type, direction, outcome, body, due_at, completed_at, duration_seconds, created_at, customers(name)')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5000),

    supabase
      .from('bhph_payments')
      .select('down_payment, loan_amount, monthly_payment, payment_day_of_month, next_due_date, total_paid, status, notes, created_at, customers(name), vehicles(stock_no, make, model, year)')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('ledger_transactions')
      .select('date, vendor_norm, amount_total, tax, memo, status, created_at')
      .eq('user_id', orgId)
      .order('date', { ascending: false })
      .limit(5000),

    supabase
      .from('tasks')
      .select('title, task_type, status, priority, due_at, completed_at, notes, created_at, customers(name), vehicles(stock_no, make, model)')
      .eq('user_id', orgId)
      .order('created_at', { ascending: false }),

    supabase
      .from('contacts')
      .select('name, company, title, phone, email, fax, address, website, notes, created_at')
      .eq('org_id', orgId)
      .order('name', { ascending: true }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers  = settled<any>(results[0])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vehicles   = settled<any>(results[1])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activities = settled<any>(results[2])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bhph       = settled<any>(results[3])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledger     = settled<any>(results[4])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks      = settled<any>(results[5])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts   = settled<any>(results[6])

  const wb = XLSX.utils.book_new()

  // ── Customers ──────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Name', 'Phone', 'Alt Phone', 'Email', 'Lead Source', 'Pipeline State', 'Tags', 'Notes', 'First Response At', 'Response Time (sec)', 'Created At'],
    ...customers.map((c: Record<string, unknown>) => [
      c.name, c.primary_phone, c.secondary_phone ?? '', c.email ?? '',
      c.lead_source ?? '', c.thread_state ?? '',
      Array.isArray(c.tags) ? (c.tags as string[]).join(', ') : '',
      c.notes ?? '', c.first_response_at ?? '', c.response_time_seconds ?? '', c.created_at,
    ]),
  ]), 'Customers')

  // ── Vehicles ───────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Stock #', 'VIN', 'Year', 'Make', 'Model', 'Trim', 'Color', 'Mileage', 'Price', 'Status', 'Sold Price', 'Sold At', 'Notes', 'Created At'],
    ...vehicles.map((v: Record<string, unknown>) => [
      v.stock_no, v.vin ?? '', v.year, v.make, v.model, v.trim ?? '',
      v.color ?? '', v.mileage ?? '', v.price ?? '', v.status,
      v.sold_price ?? '', v.sold_at ?? '', v.notes ?? '', v.created_at,
    ]),
  ]), 'Vehicles')

  // ── Activities ─────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Customer', 'Type', 'Direction', 'Outcome', 'Body', 'Due At', 'Completed At', 'Duration (sec)', 'Created At'],
    ...activities.map((a: Record<string, unknown>) => [
      (a.customers as { name?: string } | null)?.name ?? '',
      a.type, a.direction ?? '', a.outcome ?? '',
      a.body ?? '', a.due_at ?? '', a.completed_at ?? '',
      a.duration_seconds ?? '', a.created_at,
    ]),
  ]), 'Activities')

  // ── BHPH ───────────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Customer', 'Vehicle', 'Down Payment', 'Loan Amount', 'Monthly Payment', 'Payment Day', 'Next Due', 'Total Paid', 'Status', 'Notes', 'Created At'],
    ...bhph.map((b: Record<string, unknown>) => {
      const veh = b.vehicles as { stock_no?: string; make?: string; model?: string; year?: number } | null
      const vehicleLabel = veh ? `${veh.year} ${veh.make} ${veh.model} (${veh.stock_no})` : ''
      return [
        (b.customers as { name?: string } | null)?.name ?? '',
        vehicleLabel,
        b.down_payment ?? 0, b.loan_amount ?? 0, b.monthly_payment ?? 0,
        b.payment_day_of_month, b.next_due_date,
        b.total_paid ?? 0, b.status, b.notes ?? '', b.created_at,
      ]
    }),
  ]), 'BHPH')

  // ── Ledger ─────────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date', 'Vendor', 'Amount', 'Tax', 'Memo', 'Status', 'Created At'],
    ...ledger.map((l: Record<string, unknown>) => [
      l.date, l.vendor_norm ?? '', l.amount_total ?? '', l.tax ?? '',
      l.memo ?? '', l.status, l.created_at,
    ]),
  ]), 'Ledger')

  // ── Tasks ──────────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Title', 'Type', 'Status', 'Priority', 'Due At', 'Completed At', 'Customer', 'Vehicle', 'Notes', 'Created At'],
    ...tasks.map((t: Record<string, unknown>) => {
      const veh = t.vehicles as { stock_no?: string; make?: string; model?: string } | null
      const vehicleLabel = veh ? `${veh.make} ${veh.model} (${veh.stock_no})` : ''
      return [
        t.title, t.task_type, t.status, t.priority,
        t.due_at ?? '', t.completed_at ?? '',
        (t.customers as { name?: string } | null)?.name ?? '',
        vehicleLabel, t.notes ?? '', t.created_at,
      ]
    }),
  ]), 'Tasks')

  // ── Contacts ───────────────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Name', 'Company', 'Title', 'Phone', 'Email', 'Fax', 'Address', 'Website', 'Notes', 'Created At'],
    ...contacts.map((c: Record<string, unknown>) => [
      c.name, c.company ?? '', c.title ?? '', c.phone ?? '',
      c.email ?? '', c.fax ?? '', c.address ?? '',
      c.website ?? '', c.notes ?? '', c.created_at,
    ]),
  ]), 'Contacts')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="dealerwyze-export-${date}.xlsx"`,
    },
  })
}
