'use client'

import { Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatPhoneForTel } from '@/lib/utils'
import { setPendingCall } from './usePendingCall'

interface CallButtonProps {
  customerId: string
  customerName: string
  phone: string
  className?: string
}

export default function CallButton({ customerId, customerName, phone, className }: CallButtonProps) {
  const supabase = createClient()

  async function handleCall() {
    // 1. Create pending activity in DB
    const { data, error } = await supabase
      .from('activities')
      .insert({
        type: 'call',
        direction: 'outbound',
        outcome: 'pending',
        customer_id: customerId,
        priority: 'normal',
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('Failed to create call activity', error)
      return
    }

    // 2. Store pending call in localStorage
    setPendingCall({
      activityId: data.id,
      customerId,
      customerName,
      phone,
    })

    // 3. Open native dialer
    window.location.href = `tel:${formatPhoneForTel(phone)}`
  }

  return (
    <Button
      onClick={handleCall}
      size="lg"
      className={className}
    >
      <Phone className="h-4 w-4 mr-2" />
      Call
    </Button>
  )
}
