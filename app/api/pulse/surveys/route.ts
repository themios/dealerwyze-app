import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { deliverPulseSurvey } from '@/lib/pulse/deliver'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  const body = await req.json()
  const { customer_id } = body

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify customer belongs to this org
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const result = await deliverPulseSurvey({
    orgId:       profile.org_id,
    customerId:  customer_id,
    triggerType: 'manual',
  })

  if (!result) {
    return NextResponse.json(
      { error: 'Pulse not enabled or survey already sent recently' },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
