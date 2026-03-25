'use client'

import { useEffect, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'

interface TokenDetails {
  amount: number
  customer_name: string
  dealer_name: string
  vehicle_label: string | null
  stripe_publishable_key: string | null
}

// Inner form — must be inside <Elements>
function CheckoutForm({ token, amount, dealerName }: { token: string; amount: number; dealerName: string }) {
  const stripe   = useStripe()
  const elements = useElements()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setStatus('loading')
    setErrMsg(null)

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    })

    if (error) {
      setErrMsg(error.message ?? 'Payment failed')
      setStatus('error')
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      // Notify our API to log the payment
      await fetch(`/api/pay/${token}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'confirm', payment_intent_id: paymentIntent.id }),
      })
      setStatus('success')
    }
  }

  if (status === 'success') {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-5xl">✓</div>
        <p className="text-xl font-semibold text-gray-900">Payment received!</p>
        <p className="text-sm text-gray-500">
          Your payment of ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} to {dealerName} has been processed. You will receive a confirmation shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <PaymentElement />
      {errMsg && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === 'loading' || !stripe}
        className="w-full h-12 rounded-xl bg-gray-900 text-white font-semibold text-base disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
      >
        {status === 'loading'
          ? 'Processing...'
          : `Pay $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        }
      </button>
    </form>
  )
}

export default function PaymentForm({ token }: { token: string }) {
  const [details, setDetails]       = useState<TokenDetails | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null)

  useEffect(() => {
    fetch(`/api/pay/${token}`)
      .then(r => r.json())
      .then(async (data: TokenDetails & { error?: string }) => {
        if (data.error) { setError(data.error); return }
        setDetails(data)

        if (!data.stripe_publishable_key) {
          setError('Online payment is not available for this dealer. Please call to pay.')
          return
        }

        setStripePromise(loadStripe(data.stripe_publishable_key))

        // Create PaymentIntent
        const intentRes = await fetch(`/api/pay/${token}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'intent' }),
        })
        const intentData = await intentRes.json()
        if (intentData.client_secret) {
          setClientSecret(intentData.client_secret)
        } else {
          setError(intentData.error ?? 'Could not initiate payment')
        }
      })
      .catch(() => setError('Could not load payment details'))
  }, [token])

  if (error) {
    return (
      <div className="p-8 text-center space-y-2">
        <p className="text-gray-700 font-medium">{error}</p>
        <p className="text-sm text-gray-400">If you need help, please contact your dealer directly.</p>
      </div>
    )
  }

  if (!details || !clientSecret || !stripePromise) {
    return (
      <div className="p-8 text-center">
        <div className="h-8 w-8 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  return (
    <div>
      {/* Payment summary */}
      <div className="px-6 py-4 border-b border-gray-100 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">To</span>
          <span className="text-sm font-medium text-gray-900">{details.dealer_name}</span>
        </div>
        {details.vehicle_label && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Vehicle</span>
            <span className="text-sm text-gray-700">{details.vehicle_label}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-base text-gray-700 font-medium">Amount due</span>
          <span className="text-2xl font-bold text-gray-900">
            ${details.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
        <CheckoutForm token={token} amount={details.amount} dealerName={details.dealer_name} />
      </Elements>
    </div>
  )
}
