/**
 * Spreadsheet import: parse CSV/XLSX and map columns to ParsedLead.
 * Template columns: Name, Phone, Email, Vehicle, VIN, ZIP, Source, Comments
 * We accept many common synonyms so user spreadsheets work without changing headers.
 */
import type { ParsedLead } from './parser'
import type { LeadSource } from './parser'
import { normalizePhone } from '@/lib/utils/phone'

export const TEMPLATE_HEADERS = [
  'Name',
  'Phone',
  'Email',
  'Vehicle',
  'VIN',
  'ZIP',
  'Source',
  'Comments',
] as const

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number]

/** Canonical field names we output */
const FIELDS = ['name', 'phone', 'email', 'vehicle', 'vin', 'zip', 'source', 'comments'] as const
type Field = (typeof FIELDS)[number]

/** Synonyms per field (lowercase). First in each array is the template header. */
const COLUMN_SYNONYMS: Record<Field, string[]> = {
  name: [
    'name', 'full name', 'customer name', 'lead name', 'contact name', 'buyer name',
    'first name', 'last name', 'customer', 'contact',
  ],
  phone: [
    'phone', 'phone number', 'telephone', 'mobile', 'cell', 'cell phone',
    'primary phone', 'contact phone', 'work phone', 'home phone',
  ],
  email: [
    'email', 'email address', 'e-mail', 'e-mail address', 'customer email', 'contact email',
  ],
  vehicle: [
    'vehicle', 'car', 'interest', 'vehicle of interest', 'interested in', 'interested vehicle',
    'year make model', 'ymm', 'year', 'make', 'model', 'trim',
  ],
  vin: [
    'vin', 'vehicle identification number', 'vin number',
  ],
  zip: [
    'zip', 'zip code', 'zipcode', 'postal code', 'postcode',
  ],
  source: [
    'source', 'lead source', 'origin', 'where did they come from', 'referral source',
  ],
  comments: [
    'comments', 'notes', 'message', 'buyer comments', 'customer message', 'notes/comments',
  ],
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Find which canonical field a header maps to, or null */
function mapHeaderToField(header: string): Field | null {
  const n = normalizeHeader(header)
  for (const field of FIELDS) {
    if (COLUMN_SYNONYMS[field].some(syn => n === syn || n.includes(syn) || syn.includes(n))) {
      return field
    }
  }
  return null
}

/** Build a row map: header index → field. Headers are first row. */
export function buildColumnMap(headers: string[]): Record<number, Field> {
  const map: Record<number, Field> = {}
  headers.forEach((h, i) => {
    const field = mapHeaderToField(h)
    if (field) map[i] = field
  })
  return map
}

function normalizeSource(val: string): LeadSource {
  const v = val.trim().toLowerCase()
  if (!v) return 'other'
  if (v.includes('cargurus')) return 'cargurus'
  if (v.includes('autotrader')) return 'autotrader'
  if (v.includes('offerup')) return 'offerup'
  if (v.includes('facebook')) return 'facebook'
  if (v.includes('kbb') || v.includes('kelley')) return 'kbb'
  if (v.includes('autolist')) return 'autolist'
  if (v.includes('carsforsale')) return 'carsforsale'
  return 'other'
}

/** Convert one row (array of cell values) to ParsedLead using column map. Row must have name + (phone or email). */
export function rowToLead(row: string[], columnMap: Record<number, Field>, rowIndex: number): ParsedLead | null {
  const get = (f: Field) => {
    const i = Object.entries(columnMap).find(([, field]) => field === f)?.[0]
    return i != null ? String(row[Number(i)] ?? '').trim() : ''
  }
  const name = get('name')
  const phoneRaw = get('phone')
  const email = get('email')
  if (!name) return null
  if (!phoneRaw && !email) return null

  const phone = phoneRaw ? normalizePhone(phoneRaw) : ''
  const phoneDisplay = phone.length === 10 ? phone : phoneRaw || ''
  // DB requires primary_phone; when only email provided use name as placeholder so ingest can create
  const phoneForDb = phoneDisplay || (email ? name : '')

  return {
    name,
    email: email || '',
    phone: phoneForDb,
    zip: get('zip'),
    vehicle: get('vehicle'),
    vin: get('vin'),
    listed_price: null,
    comments: get('comments'),
    source: normalizeSource(get('source')),
    raw_text: `Row ${rowIndex + 1}`,
  }
}

/** Parse CSV string (first row = headers). Returns { headers, rows }. */
export function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }
  const parseRow = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        inQuotes = !inQuotes
      } else if ((c === ',' && !inQuotes) || c === '\t') {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += c
      }
    }
    out.push(cur.trim())
    return out
  }
  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow)
  return { headers, rows }
}

/** Parse XLSX buffer: first sheet, first row = headers. */
export function parseXlsx(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return { headers: [], rows: [] }
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
  if (data.length === 0) return { headers: [], rows: [] }
  const headers = (data[0] || []).map((c: unknown) => String(c ?? ''))
  const rows = data.slice(1).map((row: unknown[]) => (Array.isArray(row) ? row.map(c => String(c ?? '')) : []))
  return { headers, rows }
}

/** Generate CSV template content (headers + one example row). */
export function generateTemplateCsv(): string {
  const headers = [...TEMPLATE_HEADERS]
  const example = [
    'John Smith',
    '(555) 123-4567',
    'john@example.com',
    '2020 Honda Civic',
    '',
    '90210',
    'Website',
    'Interested in test drive',
  ]
  const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)
  return [headers.map(escape).join(','), example.map(escape).join(',')].join('\n')
}
