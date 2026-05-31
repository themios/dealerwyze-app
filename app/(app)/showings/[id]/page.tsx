'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import ShowingRequestDetail from './ShowingRequestDetail'

export default function ShowingDetailPage() {
  const params = useParams()
  const showingId = typeof params.id === 'string' ? params.id : ''
  const [loading, setLoading] = useState(true)
  const [showingRequest, setShowingRequest] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('showing_requests')
          .select(
            `
            id, org_id, listing_id, agent_id, buyer_name, buyer_email,
            buyer_phone, requested_time_1, requested_time_2, requested_time_3,
            message, status, confirmed_at, confirmed_time, created_at,
            vehicle:listing_id(address_line1, city, state, zip)
          `
          )
          .eq('id', showingId)
          .single()

        if (data) {
          setShowingRequest(data)
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

  if (error || !showingRequest) {
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

        <ShowingRequestDetail showing={showingRequest} />
      </div>
    </div>
  )
}
