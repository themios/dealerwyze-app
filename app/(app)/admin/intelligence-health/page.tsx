'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OrgSummary {
  org_id: string
  total: number
  by_type: Record<string, number>
}

interface HealthData {
  since: string
  raw_count: number
  orgs: OrgSummary[]
}

const EVENT_TYPES = [
  'lead_received',
  'message_sent',
  'message_received',
  'appointment_set',
  'lead_sold',
  'lead_lost',
  'vehicle_sold',
  'call_completed',
  'task_completed',
]

export default function IntelligenceHealthPage() {
  const [data, setData]       = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/intelligence-health')
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json() as HealthData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <TopBar title="Intelligence Event Stream" />
      <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">DMAIC Event Stream Health</h1>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">
                Last 24 h — {data.raw_count} events across {data.orgs.length} org{data.orgs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-gray-500 py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && data && data.orgs.length === 0 && (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-gray-400">
            No events in the last 24 hours. Trigger a lead, SMS, or state change to verify instrumentation.
          </div>
        )}

        {!loading && data && data.orgs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2 text-left">Org ID</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  {EVENT_TYPES.map(t => (
                    <th key={t} className="px-3 py-2 text-right text-[10px] leading-tight">
                      {t.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.orgs.map(org => (
                  <tr key={org.org_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 max-w-[200px] truncate">
                      {org.org_id}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{org.total}</td>
                    {EVENT_TYPES.map(t => (
                      <td key={t} className="px-3 py-2 text-right text-gray-600">
                        {org.by_type[t] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
