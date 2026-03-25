/**
 * PostGrid Print & Mail API client (per-dealer API key).
 * Docs: https://docs.postgrid.com
 */

const POSTGRID_BASE = 'https://api.postgrid.com/print-mail/v1'

export interface PostGridRecipient {
  firstName:   string
  lastName?:   string
  addressLine1: string
  city:        string
  provinceOrState: string
  postalOrZip: string
  countryCode: string  // 'US'
}

export interface PostGridSender {
  companyName: string
  addressLine1: string
  city:        string
  provinceOrState: string
  postalOrZip: string
  countryCode: string
}

export interface CreateLetterOptions {
  apiKey:    string
  to:        PostGridRecipient
  from:      PostGridSender
  html:      string   // rendered card HTML
  description?: string
}

export interface PostGridJobResult {
  postgridJobId:     string
  status:            string
  estimatedDelivery: Date | null
}

export async function createPostGridLetter(opts: CreateLetterOptions): Promise<PostGridJobResult> {
  const res = await fetch(`${POSTGRID_BASE}/letters`, {
    method:  'POST',
    headers: {
      'x-api-key':    opts.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to:          opts.to,
      from:        opts.from,
      html:        opts.html,
      description: opts.description ?? 'DealerWyze retention card',
      size:        '4x6',  // postcard size
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PostGrid error ${res.status}: ${body}`)
  }

  const data = await res.json()
  const estimatedDelivery = data.expectedDeliveryDate
    ? new Date(data.expectedDeliveryDate)
    : null

  return {
    postgridJobId:     data.id,
    status:            data.status ?? 'queued',
    estimatedDelivery,
  }
}

export async function getPostGridLetterStatus(apiKey: string, jobId: string): Promise<{ status: string; estimatedDelivery: Date | null }> {
  const res = await fetch(`${POSTGRID_BASE}/letters/${jobId}`, {
    headers: { 'x-api-key': apiKey },
  })

  if (!res.ok) throw new Error(`PostGrid status error ${res.status}`)

  const data = await res.json()
  return {
    status:            data.status ?? 'unknown',
    estimatedDelivery: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null,
  }
}
