import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { sendOutboundSms, SmsSendError } from '@/lib/sms/sendOutbound'

/**
 * POST /api/sms/send
 * Body: { to: string, body: string, customer_id: string, vehicle_id?: string, is_mms?: boolean }
 */
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const orgId = profile.org_id

  const { to, body, customer_id, vehicle_id, is_mms = false, mediaUrls = [] } = await req.json() as {
    to: string; body: string; customer_id?: string; vehicle_id?: string; is_mms?: boolean; mediaUrls?: string[]
  }

  try {
    const result = await sendOutboundSms({
      orgId,
      to,
      body,
      customerId: customer_id ?? null,
      vehicleId: vehicle_id ?? null,
      senderDisplayName: profile.display_name,
      isMms: is_mms,
      mediaUrls,
      markInboundAddressed: true,
    })

    return NextResponse.json({
      success: true,
      sid: result.sid,
      ...(result.warning ? { warning: result.warning } : {}),
    })
  } catch (err) {
    if (err instanceof SmsSendError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
