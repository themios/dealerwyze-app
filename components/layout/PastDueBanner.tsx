'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function PastDueBanner() {
  const [isPastDue, setIsPastDue] = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    fetch('/api/stripe/billing-status')
      .then(r => r.json())
      .then(d => {
        if (d.subscription_status === 'past_due') setIsPastDue(true)
      })
      .catch(() => {/* silent — non-critical */})
  }, [])

  async function handleFix() {
    setRedirecting(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url } = await res.json()
    window.location.href = url
  }

  if (!isPastDue) return null

  return (
    <div className="sticky top-0 z-20 bg-red-600 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <p className="text-xs font-medium leading-snug">
          Your payment failed. Update your payment method to keep access.
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="flex-shrink-0 h-7 text-xs px-3"
        onClick={handleFix}
        disabled={redirecting}
      >
        {redirecting ? 'Loading…' : 'Fix Now'}
      </Button>
    </div>
  )
}
