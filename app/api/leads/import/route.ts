import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import {
  buildColumnMap,
  rowToLead,
  parseCsv,
  parseXlsx,
} from '@/lib/leads/spreadsheetImport'
import { ingestLead } from '@/lib/leads/ingest'

const MAX_ROWS = 500
const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  const profile = await requireProfile()
  const orgId = profile.org_id

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    )
  }

  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  let headers: string[]
  let rows: string[][]

  if (name.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer)
    const parsed = parseCsv(text)
    headers = parsed.headers
    rows = parsed.rows
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const parsed = await parseXlsx(buffer)
    headers = parsed.headers
    rows = parsed.rows
  } else {
    return NextResponse.json(
      { error: 'Unsupported file type. Use CSV or XLSX.' },
      { status: 415 }
    )
  }

  const columnMap = buildColumnMap(headers)
  const hasName = Object.values(columnMap).includes('name')
  const hasContact = Object.values(columnMap).includes('phone') || Object.values(columnMap).includes('email')
  if (!hasName || !hasContact) {
    return NextResponse.json(
      {
        error: 'Spreadsheet must have a column for Name and at least one for Phone or Email. Use our template or match headers like "Name", "Phone", "Email".',
      },
      { status: 422 }
    )
  }

  const toProcess = rows.slice(0, MAX_ROWS)
  const externalIdPrefix = `spreadsheet-${orgId}-${Date.now()}`

  const results: { status: string; customer_id?: string; reason?: string; row?: number }[] = []
  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i]
    const lead = rowToLead(row, columnMap, i)
    if (!lead) {
      results.push({ status: 'skipped', reason: 'no_name_or_contact', row: i + 2 })
      continue
    }
    const extId = `${externalIdPrefix}-${i}`
    const out = await ingestLead(lead, extId, orgId)
    if ('error' in out) {
      results.push({ status: 'error', reason: out.error, row: i + 2 })
    } else if (out.status === 'duplicate') {
      results.push({ status: 'duplicate', customer_id: out.activity_id ?? undefined, row: i + 2 })
    } else if (out.status === 'skipped') {
      results.push({ status: 'skipped', reason: out.reason ?? 'skipped', row: i + 2 })
    } else {
      results.push({ status: 'created', customer_id: out.customer_id, row: i + 2 })
    }
  }

  const created = results.filter(r => r.status === 'created').length
  const duplicate = results.filter(r => r.status === 'duplicate').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const errors = results.filter(r => r.status === 'error').length
  const totalRows = rows.length
  const overLimit = totalRows > MAX_ROWS ? totalRows - MAX_ROWS : 0

  return NextResponse.json({
    summary: {
      total_rows: totalRows,
      processed: toProcess.length,
      created,
      duplicate,
      skipped,
      errors,
      over_limit: overLimit,
    },
    results: results.slice(0, 100),
  })
}
