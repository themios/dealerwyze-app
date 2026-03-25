import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import BookingForm from './BookingForm'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function BookingPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('business_name, booking_enabled')
    .eq('org_id', slug)
    .maybeSingle()

  const dealerName = settings?.business_name ?? 'Our Dealership'
  const enabled    = settings?.booking_enabled ?? false

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-900 px-6 py-5">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{dealerName}</p>
            <h1 className="text-white text-xl font-bold">Book a Visit</h1>
            <p className="text-gray-300 text-sm mt-1">Test drives, questions, or just stopping by</p>
          </div>

          {!enabled ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-gray-700 font-medium">Online booking is not available right now.</p>
              <p className="text-sm text-gray-400">Please call or visit us directly.</p>
            </div>
          ) : (
            <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading...</div>}>
              <BookingForm slug={slug} />
            </Suspense>
          )}
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by DealerWyze
        </p>
      </div>
    </div>
  )
}
