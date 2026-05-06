'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'

function InnerForm({
  setupToken,
  onDone,
  onError,
}: {
  setupToken: string
  onDone: () => void
  onError: (msg: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    if (!stripe || !elements) return
    setBusy(true)
    onError('')
    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      })
      if (error) {
        onError(error.message ?? 'Bank setup could not be completed.')
        setBusy(false)
        return
      }
      const siId = setupIntent?.id
      if (!siId) {
        onError('Setup did not finish. Please try again.')
        setBusy(false)
        return
      }
      const res = await fetch('/api/bhph/confirm-ach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: setupToken, setupIntentId: siId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(typeof data.error === 'string' ? data.error : 'Could not save bank account.')
        setBusy(false)
        return
      }
      onDone()
    } catch {
      onError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }, [stripe, elements, setupToken, onDone, onError])

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button
        type="button"
        className="w-full bg-[var(--brand-orange)] hover:bg-[var(--brand-orange)]/90 text-white"
        disabled={!stripe || busy}
        onClick={() => void submit()}
      >
        {busy ? 'Saving…' : 'Link bank account'}
      </Button>
    </div>
  )
}

export default function AchSetupClient({
  setupToken,
  dealerName,
  vehicleDescription,
  monthlyAmount,
}: {
  setupToken: string
  dealerName: string
  vehicleDescription: string
  monthlyAmount: number
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loadingSetup, setLoadingSetup] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/bhph/setup-ach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: setupToken }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setLoadError(typeof data.error === 'string' ? data.error : 'This link is not valid.')
          setLoadingSetup(false)
          return
        }
        if (typeof data.clientSecret === 'string' && typeof data.publishableKey === 'string') {
          setClientSecret(data.clientSecret)
          setPublishableKey(data.publishableKey)
        } else {
          setLoadError('Could not start bank setup.')
        }
      } catch {
        if (!cancelled) setLoadError('Could not start bank setup.')
      } finally {
        if (!cancelled) setLoadingSetup(false)
      }
    })()
    return () => { cancelled = true }
  }, [setupToken])

  if (loadingSetup) {
    return <p className="text-sm text-muted-foreground text-center py-8">Loading secure checkout…</p>
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {loadError}
      </div>
    )
  }

  if (success) {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 text-sm text-green-800 dark:text-green-300">
        You&apos;re set up. Payments will pull automatically from your bank on each due date.
      </div>
    )
  }

  if (!clientSecret || !publishableKey) {
    return (
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        Bank setup is temporarily unavailable. Please contact your dealer.
      </div>
    )
  }

  const stripePromise = loadStripe(publishableKey)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm space-y-1">
        <p>
          <span className="text-muted-foreground">Dealer:</span>{' '}
          <span className="font-medium text-foreground">{dealerName}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Vehicle:</span>{' '}
          <span className="font-medium text-foreground">{vehicleDescription}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Scheduled payment:</span>{' '}
          <span className="font-medium tabular-nums">
            {monthlyAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </span>
        </p>
      </div>

      {formError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <InnerForm
          setupToken={setupToken}
          onDone={() => setSuccess(true)}
          onError={setFormError}
        />
      </Elements>
    </div>
  )
}
