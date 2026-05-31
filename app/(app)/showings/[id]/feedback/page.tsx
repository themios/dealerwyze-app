'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ShowingFeedbackForm from './ShowingFeedbackForm'

export default function FeedbackPage() {
  const params = useParams()
  const router = useRouter()
  const showingId = typeof params.id === 'string' ? params.id : ''
  const [loading, setLoading] = useState(true)
  const [showing, setShowing] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('showing_requests')
          .select(
            `
            id, buyer_name, confirmed_time, status,
            vehicle:listing_id(address_line1, city, state, zip)
          `
          )
          .eq('id', showingId)
          .single()

        if (data) {
          setShowing(data)
        } else {
          setError('Showing request not found')
        }
      } catch (err) {
        setError('Failed to load showing request')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    if (showingId) {
      void load()
    }
  }, [showingId, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (error || !showing) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/today"
            className="flex items-center gap-2 text-blue-600 hover:underline mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <p className="text-red-600">{error || 'Something went wrong'}</p>
        </div>
      </div>
    )
  }

  const address = showing.vehicle
    ? `${showing.vehicle.address_line1}, ${showing.vehicle.city}, ${showing.vehicle.state}`
    : 'Property'

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/today"
          className="flex items-center gap-2 text-blue-600 hover:underline mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Today
        </Link>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Showing Feedback
          </h1>
          <p className="text-gray-600 mb-6">
            {showing.buyer_name} at {address}
          </p>
          {showing.confirmed_time && (
            <p className="text-sm text-gray-500 mb-6">
              Scheduled for{' '}
              {new Date(showing.confirmed_time).toLocaleString()}
            </p>
          )}

          <ShowingFeedbackForm showing={showing} />
        </div>
      </div>
    </div>
  )
}
