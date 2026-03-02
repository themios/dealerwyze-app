import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/fax/callback
 * Twilio Programmable Fax status callback.
 * Updates faxes.status, num_pages, error_code based on Twilio webhook.
 *
 * Twilio sends: FaxSid, Status, NumPages, ErrorCode, ErrorMessage (form-encoded)
 * Statuses: queued → processing → sending → delivered | no-answer | busy | failed | canceled
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: URLSearchParams
  try {
    const text = await req.text()
    body = new URLSearchParams(text)
  } catch {
    return new NextResponse('Bad Request', { status: 400 })
  }

  const faxSid      = body.get('FaxSid')
  const status      = body.get('Status')
  const numPages    = body.get('NumPages')
  const errorCode   = body.get('ErrorCode')
  const errorMsg    = body.get('ErrorMessage')

  if (!faxSid || !status) {
    return new NextResponse('Missing FaxSid or Status', { status: 400 })
  }

  const supabase = createServiceClient()

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (numPages)  update.num_pages  = parseInt(numPages, 10)
  if (errorCode) update.error_code = errorCode
  if (errorMsg)  update.error_msg  = errorMsg

  const { error } = await supabase
    .from('faxes')
    .update(update)
    .eq('twilio_sid', faxSid)

  if (error) {
    console.error('[fax/callback] db update failed:', error.message)
    // Return 200 anyway — Twilio will retry on non-2xx
  } else {
    console.log(`[fax/callback] ${faxSid} → ${status}`)
  }

  return new NextResponse('OK', { status: 200 })
}
