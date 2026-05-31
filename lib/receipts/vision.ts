import { getAiClient, AI_MODEL, imageBlock } from '@/lib/ai/client'

export interface ReceiptExtraction {
  vendor_raw: string | null
  vendor_norm: string | null
  receipt_date: string | null
  location_raw: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  currency: string
  payment_hint: string | null
  top3: Array<{
    category_id: string
    category_name: string
    confidence: number
    rationale: string
    requires_vehicle: boolean
  }>
  recommended_category_id: string | null
  requires_vehicle: boolean
  data_quality_flags: string[]
  suggested_tags: string[]
  memo: string
}

const SYSTEM_PROMPT = `You are a receipt OCR and bookkeeping classification engine for small independent used-car dealers.
CRITICAL: Output ONLY a single raw JSON object. No markdown, no code fences, no explanation before or after.`

export async function classifyReceipt(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  categories: Array<{ id: string; name: string; requires_vehicle: boolean }>
): Promise<ReceiptExtraction> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set')

  const catList = categories
    .map(c => `  {"id":"${c.id}","name":"${c.name}","requires_vehicle":${c.requires_vehicle}}`)
    .join('\n')

  const userPrompt = `Extract all data from this receipt image and classify it into a dealer bookkeeping category.

Available categories:
${catList}

OUTPUT a single JSON object with these EXACT fields (no extra keys):
{
  "vendor_raw": "vendor name exactly as printed on receipt, or null",
  "vendor_norm": "normalized UPPERCASE canonical name (e.g. O'REILLY AUTO PARTS), or null",
  "receipt_date": "YYYY-MM-DD or null",
  "location_raw": "city/state or address string or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "currency": "USD",
  "payment_hint": "CASH, VISA, MASTERCARD, AMEX, CHECK, or null",
  "top3": [
    {"category_id":"uuid","category_name":"name","confidence":0.85,"rationale":"brief reason","requires_vehicle":false},
    {"category_id":"uuid","category_name":"name","confidence":0.10,"rationale":"brief reason","requires_vehicle":false},
    {"category_id":"uuid","category_name":"name","confidence":0.05,"rationale":"brief reason","requires_vehicle":false}
  ],
  "recommended_category_id": "uuid of highest-confidence top3 item, or null",
  "requires_vehicle": false,
  "data_quality_flags": [],
  "suggested_tags": [],
  "memo": "short auto-memo max 10 words"
}

CLASSIFICATION RULES (use only IDs from the categories list above):
- Auto parts stores (O'Reilly, AutoZone, NAPA, Advance Auto) → Recon: Parts (requires_vehicle: true)
- Mechanics, body shops, tire shops → Recon: Labor / Mechanic (requires_vehicle: true)
- Gas stations (Shell, Chevron, ARCO, etc.) → Fuel
- Digital ad platforms (Cars.com, AutoTrader, CarGurus, Facebook Ads) → Advertising & Leads
- Auction fees (Manheim, Copart, ADESA, dealer auctions) → Auction & Fees
- DMV, title services, registration → DMV / Registration / Title
- Insurance companies → Insurance
- Software, SaaS subscriptions (DealerSocket, VinSolutions, etc.) → Software / Subscriptions
- Office supply stores (Staples, Office Depot, Amazon supplies) → Office / Supplies
- Towing companies, transport services → Towing / Transport

CONSTRAINTS:
- top3 must have exactly 3 items
- top3 confidences must sum to 1.00 (two decimal places)
- Only use category_id values from the list provided above
- If vendor/date/total is unclear, add a flag to data_quality_flags`

  const response = await getAiClient().chat.completions.create({
    model: AI_MODEL,
    max_tokens: 900,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          imageBlock(mimeType, imageBase64),
          { type: 'text', text: userPrompt },
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
    return JSON.parse(text.slice(start, end + 1)) as ReceiptExtraction
  } catch {
    throw new Error(`Invalid JSON from AI: ${text.slice(start, start + 200)}`)
  }
}
