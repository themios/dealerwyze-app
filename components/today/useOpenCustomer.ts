'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Mark the activity as addressed (user opened customer from Today) and navigate
 * to the customer page. The card will be hidden until next day or follow-up date.
 */
export function useOpenCustomer() {
  const router = useRouter()
  const supabase = createClient()

  return (activityId: string, customerId: string) => {
    supabase
      .from('activities')
      .update({ addressed_at: new Date().toISOString() })
      .eq('id', activityId)
      .then(() => {
        router.push(`/customers/${customerId}`)
      })
  }
}
