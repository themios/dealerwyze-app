import { aiComplete, AI_MODEL, imageBlock } from '@/lib/ai/client'

export interface IncomeExtraction {
  payer: string | null            // person or business that paid us
  amount: number | null           // total received
  date: string | null             // YYYY-MM-DD
  check_number: string | null     // for check images
  payment_method: 'check' | 'cashiers_check' | 'cash' | 'wire' | 'zelle' | 'venmo' | 'ach' | 'card' | 'other' | null
  bank_name: string | null        // issuing bank for checks
  reference_number: string | null // wire ref, ACH trace, transaction ID
  memo: string | null             // check memo line or description
  data_quality_flags: string[]
}

const SYSTEM_PROMPT = `You are an income document OCR engine for a small business.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation.`

const USER_PROMPT = `Extract payment/income information from this document image.

Documents you may receive: personal check, cashier's check, money order, wire transfer confirmation,
Zelle/Venmo/Cash App screenshot, ACH confirmation, deposit receipt, cash receipt.

OUTPUT a single JSON object with these EXACT fields:
{
  "payer": "name of the person or business that paid (not the recipient), or null",
  "amount": number or null,
  "date": "YYYY-MM-DD or null",
  "check_number": "check number as printed, or null",
  "payment_method": "check|cashiers_check|cash|wire|zelle|venmo|ach|card|other or null",
  "bank_name": "issuing bank name for checks, or null",
  "reference_number": "wire reference, ACH trace number, transaction ID, or null",
  "memo": "memo line text or payment description, or null",
  "data_quality_flags": []
}

RULES:
- payer: the person/business SENDING the money (buyer, tenant, customer). NOT the recipient (the dealer/agent).
- amount: numeric only, no currency symbol. "$12,500.00" → 12500.00
- For Zelle/Venmo: sender name is the payer; the transaction amount is the amount
- For wire confirmations: originator/sender name is the payer; reference number if shown
- For checks: "Pay to the order of" line is the RECIPIENT (ignore it); the account holder name or "From" line is the payer
- check_number: 4-6 digit number printed on check, often bottom-left corner
- If amount is unclear or document is not a payment document, add a flag to data_quality_flags
- payment_method: "check" for personal check, "cashiers_check" for bank/cashier's check or money order`

export async function extractIncomeDocument(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<IncomeExtraction> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set')

  const response = await aiComplete({
    model: AI_MODEL,
    max_tokens: 500,
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

  try {
    return JSON.parse(text.slice(start, end + 1)) as IncomeExtraction
  } catch {
    throw new Error(`Invalid JSON from AI: ${text.slice(start, start + 200)}`)
  }
}
