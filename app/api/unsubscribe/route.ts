import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { buildUnsubscribeToken } from '@/lib/security/unsubscribe'

const UnsubscribeQuerySchema = z.object({
  token: z.string().min(1).max(128).regex(/^[0-9a-f]+$/, 'Invalid token format'),
  cid:   z.string().uuid('Invalid customer id'),
})

function htmlError(msg: string, status: number) {
  return new NextResponse(
    `<html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:0 16px"><h2>Invalid link</h2><p>${msg}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html' }, status },
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const parsed = UnsubscribeQuerySchema.safeParse({
    token: searchParams.get('token') ?? '',
    cid:   searchParams.get('cid') ?? '',
  })

  if (!parsed.success) {
    return htmlError('This unsubscribe link is not valid. Please contact us directly if you want to opt out.', 400)
  }

  const { token, cid } = parsed.data

  let expected = ''
  try {
    expected = buildUnsubscribeToken(cid)
  } catch {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:0 16px"><h2>Temporarily unavailable</h2><p>This unsubscribe link cannot be processed right now. Please contact us directly and we will update your preferences manually.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' }, status: 503 },
    )
  }

  let valid = false
  try {
    valid = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'))
  } catch {
    valid = false
  }

  if (!valid) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:0 16px"><h2>Invalid link</h2><p>This unsubscribe link is not valid. Please contact us directly if you want to opt out.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' }, status: 400 },
    )
  }

  const service = createServiceClient()
  const now = new Date().toISOString()

  await service
    .from('customers')
    .update({ unsubscribe_email: true, unsubscribed_at: now })
    .eq('id', cid)

  // Cancel any active email sequences for this customer
  const { data: activeSeqs } = await service
    .from('customer_sequences')
    .select('id')
    .eq('customer_id', cid)
    .eq('status', 'active')

  for (const seq of activeSeqs ?? []) {
    await service
      .from('customer_sequences')
      .update({ status: 'cancelled', completed_at: now })
      .eq('id', seq.id)

    await service
      .from('activities')
      .update({ completed_at: now, outcome: 'cancelled' })
      .eq('customer_sequence_id', seq.id)
      .is('completed_at', null)
      .in('type', ['email_followup', 'sms_followup', 'email', 'sms'])
  }

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:0 16px;text-align:center">
  <h2>You have been unsubscribed</h2>
  <p>You will no longer receive follow-up emails from us.</p>
  <p style="color:#888;font-size:14px">If you change your mind, contact us directly and we can re-add you.</p>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html' }, status: 200 },
  )
}
