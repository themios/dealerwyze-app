/**
 * Spreadsheet import: parse CSV/XLSX and map columns to ParsedLead.
 * Template columns: Name, Phone, Email, Vehicle, VIN, ZIP, Source, Comments
 * We accept many common synonyms so user spreadsheets work without changing headers.
 */
import type { ParsedLead } from './parser'
import type { LeadSource } from './parser'
import { normalizePhone } from '@/lib/utils/phone'

export const TEMPLATE_HEADERS_DEALER = [
  'Name',
  'Phone',
  'Email',
  'Vehicle',
  'VIN',
  'ZIP',
  'Source',
  'Comments',
] as const

export const TEMPLATE_HEADERS_RE = [
  'Name',
  'Phone',
  'Email',
  'Property',
  'MLS#',
  'ZIP',
  'Source',
  'Comments',
] as const

export const TEMPLATE_HEADERS = TEMPLATE_HEADERS_DEALER
export type TemplateHeader = (typeof TEMPLATE_HEADERS_DEALER)[number]

/** Canonical field names we output */
const FIELDS = ['name', 'phone', 'email', 'vehicle', 'vin', 'zip', 'source', 'comments'] as const
type Field = (typeof FIELDS)[number]

/** Synonyms per field (lowercase). Covers both dealer and RE column names. */
const COLUMN_SYNONYMS: Record<Field, string[]> = {
  name: [
    'name', 'full name', 'customer name', 'client name', 'lead name', 'contact name',
    'buyer name', 'first name', 'last name', 'customer', 'client', 'contact',
  ],
  phone: [
    'phone', 'phone number', 'telephone', 'mobile', 'cell', 'cell phone',
    'primary phone', 'contact phone', 'work phone', 'home phone',
  ],
  email: [
    'email', 'email address', 'e-mail', 'e-mail address', 'customer email',
    'client email', 'contact email',
  ],
  vehicle: [
    // Dealer
    'vehicle', 'car', 'interest', 'vehicle of interest', 'interested in', 'interested vehicle',
    'year make model', 'ymm', 'year', 'make', 'model', 'trim',
    // Real estate
    'property', 'listing', 'property of interest', 'property interest', 'home',
    'property type', 'address of interest',
  ],
  vin: [
    // Dealer
    'vin', 'vehicle identification number', 'vin number',
    // Real estate
    'mls#', 'mls', 'mls number', 'mls id', 'listing id', 'listing number',
    'address', 'street address', 'property address',
  ],
  zip: [
    'zip', 'zip code', 'zipcode', 'postal code', 'postcode',
  ],
  source: [
    'source', 'lead source', 'origin', 'where did they come from', 'referral source',
  ],
  comments: [
    'comments', 'notes', 'message', 'buyer comments', 'customer message',
    'client notes', 'notes/comments',
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
  // Only 10-digit US numbers for ingest dedupe; never use name as phone (matches blank DB phones).
  const phoneForDb = phone.length === 10 ? phone : ''

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
export async function parseXlsx(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: string[][] }> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(buffer) as any)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  const rows: string[][] = []

  sheet.eachRow((row, rowNumber) => {
    // row.values is 1-indexed; index 0 is always null
    const vals = row.values as (unknown[] & { length: number })
    if (rowNumber === 1) {
      for (let i = 1; i < vals.length; i++) {
        headers[i - 1] = String(vals[i] ?? '')
      }
    } else {
      const cells: string[] = []
      for (let i = 1; i < vals.length; i++) {
        cells[i - 1] = String(vals[i] ?? '')
      }
      // Pad to header length so column map indices stay aligned
      while (cells.length < headers.length) cells.push('')
      rows.push(cells)
    }
  })

  return { headers, rows }
}

/** Generate CSV template content (headers + one example row). */
export function generateTemplateCsv(vertical: 'dealer' | 'real_estate' = 'dealer'): string {
  const isRE = vertical === 'real_estate'
  const headers = isRE ? [...TEMPLATE_HEADERS_RE] : [...TEMPLATE_HEADERS_DEALER]
  const example = isRE
    ? [
        'Sarah Johnson',
        '(555) 987-6543',
        'sarah@example.com',
        '4BD/3BA Colonial, Thousand Oaks',
        'ML81234567',
        '91360',
        'Zillow',
        'Looking to close within 60 days',
      ]
    : [
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

// ────────────────────────────────────────────────────────────────────────────────
// Vehicle CSV Parsing
// ────────────────────────────────────────────────────────────────────────────────

/** Vehicle CSV columns + synonyms */
const VEHICLE_CSV_COLUMNS: Record<string, string[]> = {
  vin: ['vin', 'vehicle identification number', 'vin number'],
  year: ['year', 'model year', 'model_year', 'yr'],
  make: ['make', 'manufacturer', 'brand'],
  model: ['model', 'model name'],
  price: ['price', 'sale price', 'asking price', 'list price', 'msrp', 'cost'],
  mileage: ['mileage', 'miles', 'odometer', 'miles driven'],
  color: ['color', 'exterior color', 'paint', 'exterior_color'],
  condition: ['condition', 'status', 'vehicle status'],
  auction_name: ['auction', 'auction name', 'source', 'purchased from'],
  auction_lot: ['lot', 'lot number', 'auction lot', 'lot_number'],
}

export interface ParsedVehicle {
  vin?: string
  year?: number
  make?: string
  model?: string
  price?: number
  mileage?: number
  color?: string
  condition?: string
  auction_name?: string
  auction_lot?: string
}

/** Parse CSV line (handles quoted values and commas) */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

function normalizeVehicleHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^\w]+/g, ' ')
}

/** Map CSV column index to canonical field name for vehicles */
function mapVehicleColumnHeader(header: string): string | null {
  const normalized = normalizeVehicleHeader(header)
  for (const [field, synonyms] of Object.entries(VEHICLE_CSV_COLUMNS)) {
    if (synonyms.some(s => normalized.includes(s))) {
      return field
    }
  }
  return null
}

/** Parse vehicle CSV file: returns { vehicles, errors } */
export async function parseVehicleCSV(
  file: File
): Promise<{ vehicles: ParsedVehicle[]; errors: string[] }> {
  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return { vehicles: [], errors: ['CSV must have header row and at least one data row'] }
  }

  const [headerLine, ...dataLines] = lines
  const headers = parseCSVLine(headerLine)

  // Map CSV column index to canonical field name
  const columnMap = new Map<number, string>()
  for (let i = 0; i < headers.length; i++) {
    const field = mapVehicleColumnHeader(headers[i])
    if (field) {
      columnMap.set(i, field)
    }
  }

  const vehicles: ParsedVehicle[] = []
  const errors: string[] = []

  for (let rowIdx = 0; rowIdx < dataLines.length; rowIdx++) {
    try {
      const values = parseCSVLine(dataLines[rowIdx])
      const vehicle: ParsedVehicle = {}

      for (let colIdx = 0; colIdx < values.length; colIdx++) {
        const field = columnMap.get(colIdx)
        const value = values[colIdx]?.trim()

        if (!field || !value) continue

        // Type coercion based on field
        if (field === 'year') {
          const yearNum = parseInt(value, 10)
          if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100) {
            vehicle.year = yearNum
          }
        } else if (field === 'price' || field === 'mileage') {
          const num = parseInt(value.replace(/[^0-9]/g, ''), 10)
          if (!isNaN(num)) {
            vehicle[field as 'price' | 'mileage'] = num
          }
        } else if (field === 'vin' || field === 'make' || field === 'model' || field === 'color' || field === 'condition' || field === 'auction_name' || field === 'auction_lot') {
          vehicle[field] = value
        }
      }

      // Validate required fields
      if (!vehicle.year || !vehicle.make || !vehicle.model) {
        errors.push(`Row ${rowIdx + 2}: Missing year, make, or model`)
        continue
      }

      vehicles.push(vehicle)
    } catch (err) {
      errors.push(`Row ${rowIdx + 2}: ${err instanceof Error ? err.message : 'Parse error'}`)
    }
  }

  return { vehicles, errors }
}
