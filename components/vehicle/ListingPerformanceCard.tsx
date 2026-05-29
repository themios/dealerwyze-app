'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PriceChangeEntry {
  from: number | null
  to: number | null
  changed_at: string
}

interface MetricsData {
  days_on_market: number | null
  showing_count: number | null
  price_change_count: number | null
  price_change_log: PriceChangeEntry[] | null
}

interface CmaComparable {
  address: string
  price: number | null
  bedrooms: number | null
  bathrooms: number | null
  squareFootage: number | null
  distance: number | null
}

interface CmaPayload {
  price: number | null
  priceRangeLow: number | null
  priceRangeHigh: number | null
  comparables: CmaComparable[]
}

interface CmaResponse {
  data: CmaPayload
  cached: boolean
  market_checked_at?: string | null
}

// Alias for internal use
type CmaData = CmaPayload & { cached: boolean; market_checked_at?: string | null }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 bg-muted rounded w-1/3" />
      <div className="h-4 bg-muted rounded w-1/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
    </div>
  )
}

function MetricsPanel({ vehicleId }: { vehicleId: string }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MetricsData | null>(null)
  const [failed, setFailed] = useState(false)
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/listings/${vehicleId}/metrics`)
        if (!res.ok) { setFailed(true); return }
        const json = await res.json() as MetricsData
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [vehicleId])

  if (loading) return <MetricsSkeleton />
  if (failed || !data) return <p className="text-xs text-muted-foreground">No performance data available.</p>

  const priceChanges = Array.isArray(data.price_change_log) ? data.price_change_log : []

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-xs text-muted-foreground">Days on Market</p>
        <p className="text-2xl font-bold tabular-nums">
          {data.days_on_market ?? '—'}
          {data.days_on_market != null && <span className="text-sm font-normal text-muted-foreground ml-1">days</span>}
        </p>
      </div>
      <div className="border rounded-lg p-3 bg-card">
        <p className="text-xs text-muted-foreground">Showing Count</p>
        <p className="text-2xl font-bold tabular-nums">{data.showing_count ?? 0}</p>
      </div>

      {(data.price_change_count ?? 0) > 0 && (
        <div className="col-span-2 border rounded-lg p-3 bg-card space-y-1">
          <button
            type="button"
            onClick={() => setPriceHistoryOpen(o => !o)}
            className="flex items-center justify-between w-full text-left"
          >
            <span className="text-xs text-muted-foreground">Price Changes ({data.price_change_count})</span>
            {priceHistoryOpen
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            }
          </button>
          {priceHistoryOpen && priceChanges.length > 0 && (
            <ul className="space-y-1 pt-1">
              {priceChanges.map((entry, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  Price {(entry.to ?? 0) < (entry.from ?? 0) ? 'reduced' : 'raised'} from{' '}
                  <span className="font-medium text-foreground">{entry.from != null ? formatCurrency(entry.from) : '—'}</span>
                  {' '}to{' '}
                  <span className="font-medium text-foreground">{entry.to != null ? formatCurrency(entry.to) : '—'}</span>
                  {entry.changed_at && <span> on {fmtDate(entry.changed_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function CmaPanel({ vehicleId }: { vehicleId: string }) {
  const [loading, setLoading] = useState(false)
  const [data, setCmaData] = useState<CmaData | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fetchCma = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/listings/${vehicleId}/cma`)
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        if (res.status === 503) {
          setErrorMsg('CMA unavailable — RentCast API key not configured.')
        } else if (res.status === 422) {
          setErrorMsg('Add a complete property address to generate a CMA.')
        } else {
          setErrorMsg(String(json.error ?? 'Could not fetch CMA data. Try again.'))
        }
        return
      }
      // Route returns { data: CmaPayload, cached: bool, market_checked_at?: string }
      const resp = json as unknown as CmaResponse
      setCmaData({
        ...resp.data,
        cached: resp.cached,
        market_checked_at: resp.market_checked_at ?? null,
      })
    } catch {
      setErrorMsg('Network error — check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Comparable Market Analysis</p>
        {data?.cached && data.market_checked_at && (
          <button
            type="button"
            onClick={fetchCma}
            className="text-xs text-primary underline"
          >
            Data from {fmtDate(data.market_checked_at)} · Refresh
          </button>
        )}
      </div>

      {!data && !loading && !errorMsg && (
        <Button size="sm" onClick={fetchCma} className="h-9">
          Generate CMA
        </Button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Fetching comparable sales from RentCast...</span>
        </div>
      )}

      {errorMsg && (
        <div className="text-sm text-destructive">{errorMsg}</div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          {/* Estimated value */}
          <div className="border rounded-lg p-3 bg-card space-y-0.5">
            <p className="text-xs text-muted-foreground">Estimated Value</p>
            <p className="text-xl font-bold tabular-nums">
              {data.price != null ? formatCurrency(data.price) : '—'}
            </p>
            {data.priceRangeLow != null && data.priceRangeHigh != null && (
              <p className="text-xs text-muted-foreground">
                Range: {formatCurrency(data.priceRangeLow)} – {formatCurrency(data.priceRangeHigh)}
              </p>
            )}
          </div>

          {/* Comparables table */}
          {data.comparables.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium text-muted-foreground">Address</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Price</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Bd/Ba</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Sqft</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Mi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.comparables.map((comp, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-2 py-2 max-w-[140px] truncate">{comp.address}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{comp.price != null ? formatCurrency(comp.price) : '—'}</td>
                      <td className="px-2 py-2 text-right">{comp.bedrooms ?? '—'}/{comp.bathrooms ?? '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{comp.squareFootage?.toLocaleString() ?? '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{comp.distance != null ? comp.distance.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function ListingPerformanceCard({ vehicleId }: { vehicleId: string }) {
  return (
    <div className="space-y-5">
      {/* Performance metrics */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listing Performance</p>
        <MetricsPanel vehicleId={vehicleId} />
      </div>

      {/* CMA */}
      <CmaPanel vehicleId={vehicleId} />
    </div>
  )
}
