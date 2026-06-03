import type { BankStatementLine } from '@/lib/receipts/bankStatementVision'

export interface ParsedBankCsv {
  bank_name: string | null
  account_last4: string | null
  statement_start: string | null
  statement_end: string | null
  opening_balance: number | null
  closing_balance: number | null
  lines: BankStatementLine[]
  parse_warnings: string[]
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',' || ch === ';') {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell.trim())
      if (row.some(c => c.length > 0)) rows.push(row)
      row = []
      cell = ''
      if (ch === '\r') i++
    } else if (ch !== '\r') {
      cell += ch
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim())
    if (row.some(c => c.length > 0)) rows.push(row)
  }

  return rows
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findCol(headers: string[], candidates: string[]): number {
  const normed = headers.map(normHeader)
  for (const c of candidates) {
    const idx = normed.findIndex(h => h === c || h.includes(c))
    if (idx >= 0) return idx
  }
  return -1
}

function parseMoney(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1')
  if (!s || s === '-' || s === '—') return null
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? Math.abs(n) : null
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // MM/DD/YYYY or M/D/YY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    let y = Number.parseInt(slash[3], 10)
    if (y < 100) y += y >= 70 ? 1900 : 2000
    const m = slash[1].padStart(2, '0')
    const d = slash[2].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return null
}

function isSummaryRow(desc: string): boolean {
  const d = desc.toLowerCase()
  return (
    d.includes('beginning balance') ||
    d.includes('ending balance') ||
    d.includes('opening balance') ||
    d.includes('closing balance') ||
    d === 'balance' ||
    d.startsWith('total ')
  )
}

/**
 * Parse bank-export CSV (Chase, BofA, generic Date/Description/Amount).
 */
export function parseBankCsv(csvText: string): ParsedBankCsv {
  const warnings: string[] = []
  const rows = parseCsvRows(csvText.trim())
  if (rows.length < 2) {
    throw new Error('CSV must have a header row and at least one transaction')
  }

  // Skip leading metadata rows until we find a header with "date"
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = rows[i].join(' ').toLowerCase()
    if (joined.includes('date') && (joined.includes('amount') || joined.includes('debit') || joined.includes('description'))) {
      headerIdx = i
      break
    }
  }

  const headers = rows[headerIdx]
  const dateCol = findCol(headers, ['date', 'posting date', 'transaction date', 'posted date'])
  const descCol = findCol(headers, ['description', 'memo', 'details', 'name', 'payee', 'merchant'])
  const amountCol = findCol(headers, ['amount', 'transaction amount', 'amt'])
  const debitCol = findCol(headers, ['debit', 'withdrawal', 'money out', 'payment'])
  const creditCol = findCol(headers, ['credit', 'deposit', 'money in'])

  if (dateCol < 0) throw new Error('Could not find a Date column in CSV')
  if (descCol < 0 && amountCol < 0 && debitCol < 0 && creditCol < 0) {
    throw new Error('Could not find Description or Amount columns in CSV')
  }

  const lines: BankStatementLine[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row.length || row.every(c => !c)) continue

    const dateRaw = row[dateCol] ?? ''
    const date = parseDate(dateRaw)
    if (!date) continue

    const rawDesc =
      descCol >= 0
        ? row[descCol]
        : row.find((c, j) => j !== dateCol && c && !/^-?\$?[\d,.]+$/.test(c))
    const description = (rawDesc ?? '').trim() || 'Transaction'
    if (isSummaryRow(description)) continue

    let amount: number | null = null
    let direction: 'credit' | 'debit' | null = null

    if (amountCol >= 0) {
      const raw = row[amountCol] ?? ''
      const signed = Number.parseFloat(raw.replace(/[$,\s]/g, '').replace(/\(([^)]+)\)/, '-$1'))
      if (Number.isFinite(signed) && signed !== 0) {
        amount = Math.abs(signed)
        direction = signed > 0 ? 'credit' : 'debit'
      }
    }

    if (amount == null && (debitCol >= 0 || creditCol >= 0)) {
      const debit = debitCol >= 0 ? parseMoney(row[debitCol] ?? '') : null
      const credit = creditCol >= 0 ? parseMoney(row[creditCol] ?? '') : null
      if (credit && credit > 0) {
        amount = credit
        direction = 'credit'
      } else if (debit && debit > 0) {
        amount = debit
        direction = 'debit'
      }
    }

    if (!amount || !direction) continue

    lines.push({
      date,
      description,
      amount,
      direction,
      balance_after: null,
    })
  }

  if (!lines.length) {
    throw new Error('No transactions found in CSV. Check column headers match Date, Description, Amount.')
  }

  const dates = lines.map(l => l.date).sort()
  return {
    bank_name: null,
    account_last4: null,
    statement_start: dates[0] ?? null,
    statement_end: dates[dates.length - 1] ?? null,
    opening_balance: null,
    closing_balance: null,
    lines,
    parse_warnings: warnings,
  }
}
