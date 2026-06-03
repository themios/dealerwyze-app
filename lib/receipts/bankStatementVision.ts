import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'

export interface BankStatementLine {
  date: string        // YYYY-MM-DD
  description: string
  amount: number      // always positive
  direction: 'credit' | 'debit'
  balance_after: number | null
}

export interface BankStatementExtraction {
  bank_name: string | null
  account_last4: string | null
  statement_start: string | null  // YYYY-MM-DD
  statement_end: string | null    // YYYY-MM-DD
  opening_balance: number | null
  closing_balance: number | null
  lines: BankStatementLine[]
  data_quality_flags: string[]
}

const SYSTEM_PROMPT = `You are a bank statement OCR engine.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.`

const USER_PROMPT = `Extract all transaction data from this bank statement image or PDF page.

OUTPUT a single JSON object with these EXACT fields:
{
  "bank_name": "name of the bank, or null",
  "account_last4": "last 4 digits of account number, or null",
  "statement_start": "YYYY-MM-DD or null",
  "statement_end": "YYYY-MM-DD or null",
  "opening_balance": number or null,
  "closing_balance": number or null,
  "lines": [
    {
      "date": "YYYY-MM-DD",
      "description": "transaction description as printed",
      "amount": positive number,
      "direction": "credit or debit",
      "balance_after": number or null
    }
  ],
  "data_quality_flags": []
}

RULES:
- lines: include EVERY transaction row visible on this page/image
- amount: always positive (direction field handles sign)
- direction: "credit" = money coming IN (deposit, transfer in, payment received)
            "debit"  = money going OUT (purchase, withdrawal, payment sent, fee)
- date: convert any format (e.g., "06/03/26", "Jun 3") to YYYY-MM-DD. Infer year from statement period.
- description: full raw description as printed (e.g., "ZELLE FROM JOHN SMITH", "ACV AUCTIONS PAYMENT")
- balance_after: running balance column if shown, otherwise null
- opening_balance / closing_balance: the period starting and ending balances if shown
- If a line is a running balance row (not a transaction), skip it
- If the statement has multiple pages and this is not the first page, opening_balance may be null
- Add a flag to data_quality_flags if any row data is unclear or truncated`

export async function extractBankStatementPage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
): Promise<BankStatementExtraction> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set')

  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          imageBlock(mimeType, imageBase64),
          { type: 'text', text: USER_PROMPT },
        ],
      },
    ],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON in AI response: ${text.slice(0, 200)}`)
  }

  let parsed: BankStatementExtraction
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as BankStatementExtraction
  } catch {
    throw new Error(`Invalid JSON from AI: ${text.slice(start, start + 200)}`)
  }

  // Sanitize lines
  parsed.lines = (parsed.lines ?? []).filter(l =>
    l.date && l.amount > 0 && (l.direction === 'credit' || l.direction === 'debit')
  )

  return parsed
}

/**
 * Auto-match bank lines against existing ledger transactions.
 * Returns a map of bank line index → matched ledger transaction id.
 * Matching criteria: exact amount + date within 3 days.
 */
export function autoMatchLines(
  lines: BankStatementLine[],
  ledgerEntries: Array<{
    id: string
    date: string
    amount_total: number | null
    entry_type: string
  }>,
): Map<number, string> {
  const matches = new Map<number, string>()
  const usedLedgerIds = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineDate = new Date(line.date).getTime()

    for (const entry of ledgerEntries) {
      if (usedLedgerIds.has(entry.id)) continue
      if (entry.amount_total == null) continue

      const entryAmount = Math.abs(entry.amount_total)
      const entryDate = new Date(entry.date).getTime()
      const daysDiff = Math.abs(lineDate - entryDate) / 86400000

      // Credit lines match income entries; debit lines match expense entries
      const directionMatch =
        (line.direction === 'credit' && entry.entry_type === 'income') ||
        (line.direction === 'debit' && entry.entry_type === 'expense')

      if (
        directionMatch &&
        Math.abs(entryAmount - line.amount) < 0.01 &&
        daysDiff <= 3
      ) {
        matches.set(i, entry.id)
        usedLedgerIds.add(entry.id)
        break
      }
    }
  }

  return matches
}
