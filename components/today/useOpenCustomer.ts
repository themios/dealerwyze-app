'use client'

import { useRouter } from 'next/navigation'

/**
 * Mark the activity as addressed (user opened customer from Today) and navigate
 * to the customer page. The card will be hidden until next day or follow-up date.
 */
export function useOpenCustomer() {
  const router = useRouter()

  return (activityId: string, customerId: string) => {
    fetch(`/api/activities/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressed_at: new Date().toISOString() }),
    }).catch(() => {})
      .finally(() => {
        router.push(`/customers/${customerId}`)
      })
  }
}
