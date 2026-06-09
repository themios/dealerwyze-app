'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, Phone, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ShowingRequest {
  id: string
  listing_id: string
  buyer_name: string
  buyer_email: string
  buyer_phone?: string
  requested_time_1?: string
  requested_time_2?: string
  requested_time_3?: string
  message?: string
  status: 'pending' | 'confirmed' | 'declined' | 'no_show' | 'closed'
  created_at: string
}

interface Vehicle {
  id: string
  address_line1: string
  city: string
  state: string
}

const supabase = createClient()

export default function ShowingRequestsCard() {
  const [requests, setRequests] = useState<(ShowingRequest & { vehicle?: Vehicle })[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadShowings() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, org_id')
          .eq('id', user.id)
          .single()

        if (!profile) {
          setLoading(false)
          return
        }

        const { data } = await supabase
          .from('showing_requests')
          .select(
            `
            id, listing_id, buyer_name, buyer_email, buyer_phone,
            requested_time_1, requested_time_2, requested_time_3,
            message, status, created_at
          `
          )
          .eq('agent_id', profile.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5)

        if (data) {
          // Fetch vehicle details for each request
          const vehicleIds = [...new Set(data.map((r) => r.listing_id))]
          const { data: vehicles } = await supabase
            .from('vehicles')
            .select('id, address_line1, city, state')
            .in('id', vehicleIds)

          const vehicleMap = new Map(vehicles?.map((v) => [v.id, v]) ?? [])

          const enriched = data.map((r) => ({
            ...r,
            vehicle: vehicleMap.get(r.listing_id),
          }))

          setRequests(enriched)
        }
      } catch (err) {
        console.error('Failed to load showing requests:', err)
      } finally {
        setLoading(false)
      }
    }

    void loadShowings()
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">Loading...</p>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-medium text-gray-700 mb-1">Showing Requests</p>
        <p className="text-xs text-gray-500">No pending requests</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Showing Requests
          </p>
          <p className="text-sm font-medium text-blue-900 mt-1">
            {requests.length} pending
            {requests.length === 1 ? ' request' : ' requests'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {requests.map((req) => (
          <li
            key={req.id}
            className="bg-white rounded border border-blue-100 p-3 hover:border-blue-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {req.buyer_name}
                </p>
                {req.vehicle && (
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    {req.vehicle.address_line1}, {req.vehicle.city}, {req.vehicle.state}
                  </p>
                )}
              </div>
              <Link
                href={`/showings/${req.id}`}
                className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1.5 rounded text-xs transition-colors"
              >
                Respond
              </Link>
            </div>

            {/* Preferred times */}
            {(req.requested_time_1 ||
              req.requested_time_2 ||
              req.requested_time_3) && (
              <div className="flex items-center gap-1.5 text-xs text-gray-700 mb-2">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span className="truncate">
                  {[
                    req.requested_time_1,
                    req.requested_time_2,
                    req.requested_time_3,
                  ]
                    .filter(Boolean)
                    .map((t) => {
                      try {
                        return new Date(t!).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      } catch {
                        return t
                      }
                    })
                    .join(', ')}
                </span>
              </div>
            )}

            {/* Contact info */}
            <div className="flex items-center gap-3 text-xs text-gray-600">
              {req.buyer_email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  <a
                    href={`mailto:${req.buyer_email}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {req.buyer_email}
                  </a>
                </div>
              )}
              {req.buyer_phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  <a
                    href={`tel:${req.buyer_phone}`}
                    className="hover:text-blue-600 hover:underline"
                  >
                    {req.buyer_phone}
                  </a>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/showings"
        className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
      >
        View all showings
      </Link>
    </div>
  )
}
