import { Suspense } from 'react'
import PaymentForm from './PaymentForm'

interface Props {
  params: Promise<{ token: string }>
}

export default async function PayPage({ params }: Props) {
  const { token } = await params

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-900 px-6 py-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Secure Payment</p>
            <h1 className="text-white text-xl font-bold">Monthly Payment</h1>
          </div>
          <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
            <PaymentForm token={token} />
          </Suspense>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">
          Secured by Stripe. Your card info is never stored by the dealer.
        </p>
      </div>
    </div>
  )
}
