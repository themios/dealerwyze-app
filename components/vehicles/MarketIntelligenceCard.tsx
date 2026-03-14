'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, ShieldCheck, ShieldAlert, Shield, Loader2, RefreshCw, Copy, Check, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface MarketData {
  fastSalePrice:   number | null
  fairMarketPrice: number | null
  maxReturnPrice:  number | null
  confidence:      'high' | 'medium' | 'low' | 'insufficient'
  nComps:          number
  fmvRangeLow:     number | null
  fmvRangeHigh:    number | null
  medianMiles:     number | null
  avgDom:          number | null
  totalActive:     number | null
  sources:         string[]
  topProblems:     string[]
  expertConsensus: string
  repairPalScore:  number | null
  annualMaintCost: number | null
  consumerRating:  number | null
  marketIntelReport?: string
  checkedAt:       string
}

interface Props {
  vehicleId: string
  vehicleStatus: string
  initialData: MarketData | null
  initialRecallCount: number | null
  initialReliabilityTier: string | null
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — limited comps',
  insufficient: 'Insufficient data',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-600',
  medium: 'text-yellow-600',
  low: 'text-orange-500',
  insufficient: 'text-muted-foreground',
}

const TIER_ICON = {
  low:      <ShieldCheck className="h-4 w-4 text-green-500" />,
  moderate: <Shield className="h-4 w-4 text-yellow-500" />,
  high:     <ShieldAlert className="h-4 w-4 text-red-500" />,
}

const TIER_LABEL: Record<string, string> = {
  low:      'Low recall risk',
  moderate: 'Moderate risk',
  high:     'High recall risk',
}

export default function MarketIntelligenceCard({
  vehicleId,
  vehicleStatus,
  initialData,
  initialRecallCount,
  initialReliabilityTier,
}: Props) {
  const [data, setData] = useState<MarketData | null>(initialData)
  const [recallCount, setRecallCount] = useState<number | null>(initialRecallCount)
  const [reliabilityTier, setReliabilityTier] = useState<string | null>(initialReliabilityTier)
  const [loading, setLoading] = useState(false)
  const [descLoading, setDescLoading] = useState(false)
  const [description, setDescription] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  async function runPriceCheck() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/market-check`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setData(json.data)
      setRecallCount(json.data.recallCount ?? recallCount)
    } catch {
      setError('Price check failed. Check your API keys or try again.')
    } finally {
      setLoading(false)
    }
  }

  async function generateDescription() {
    setDescLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/ai-description`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setDescription(json.description)
    } catch {
      setError('Description generation failed.')
    } finally {
      setDescLoading(false)
    }
  }

  async function copyDescription() {
    if (!description) return
    await navigator.clipboard.writeText(description)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isSold = vehicleStatus === 'sold'
  const dataAgeHours = data?.checkedAt
    ? (Date.now() - new Date(data.checkedAt).getTime()) / 3_600_000
    : null
  const cooldownActive = dataAgeHours !== null && dataAgeHours < 24
  const refreshLabel = cooldownActive
    ? `Updated ${dataAgeHours < 1 ? 'just now' : `${Math.floor(dataAgeHours)}h ago`}`
    : null

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Market Intelligence</p>
        </div>
        {!isSold && (
          <Button
            variant="ghost"
            size="sm"
            onClick={runPriceCheck}
            disabled={loading || cooldownActive}
            title={cooldownActive ? 'Market data refreshes once every 24 hours' : undefined}
            className="h-7 px-2 text-xs"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : refreshLabel ? (
              refreshLabel
            ) : data ? (
              <><RefreshCw className="h-3 w-3 mr-1" />Refresh</>
            ) : 'Price Check'}
          </Button>
        )}
      </div>

      <div className="px-4 py-3 space-y-4">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {error}
          </div>
        )}

        {/* No data yet */}
        {!data && !loading && !error && (
          <p className="text-sm text-muted-foreground">
            {isSold
              ? 'Market data is not available for sold vehicles.'
              : 'Tap "Price Check" to see market pricing tiers based on actual comps.'}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2 animate-pulse">
            {[1,2,3].map(i => (
              <div key={i} className="h-14 bg-muted rounded-lg" />
            ))}
          </div>
        )}

        {/* Pricing tiers */}
        {data && !loading && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <PriceTile label="Fast Sale" sublabel="~60 days" price={data.fastSalePrice} color="bg-blue-500/10 text-blue-700 dark:text-blue-400" />
              <PriceTile label="Fair Market" sublabel="~90 days" price={data.fairMarketPrice} color="bg-green-500/10 text-green-700 dark:text-green-400" highlight />
              <PriceTile label="Max Return" sublabel="120+ days" price={data.maxReturnPrice} color="bg-purple-500/10 text-purple-700 dark:text-purple-400" />
            </div>

            {/* Confidence + range */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className={CONFIDENCE_COLOR[data.confidence]}>
                {CONFIDENCE_LABEL[data.confidence]}
                {data.nComps > 0 && ` (${data.nComps} comps)`}
              </span>
              {data.fmvRangeLow && data.fmvRangeHigh && (
                <span>Range: {formatCurrency(data.fmvRangeLow)} - {formatCurrency(data.fmvRangeHigh)}</span>
              )}
            </div>

            {/* Market context */}
            {(data.avgDom || data.totalActive) && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {data.totalActive && <span>{data.totalActive.toLocaleString()} national listings</span>}
                {data.avgDom && <span>Avg {data.avgDom}d on market</span>}
                {data.medianMiles && <span>Median {data.medianMiles.toLocaleString()}mi</span>}
              </div>
            )}

            {/* Reliability row */}
            {reliabilityTier && (
              <div className="flex items-center gap-2 pt-1 border-t text-sm">
                {TIER_ICON[reliabilityTier as keyof typeof TIER_ICON] ?? TIER_ICON.low}
                <span>{TIER_LABEL[reliabilityTier] ?? reliabilityTier}</span>
                {recallCount !== null && recallCount > 0 && (
                  <span className="text-xs text-muted-foreground">({recallCount} recall{recallCount !== 1 ? 's' : ''})</span>
                )}
                {data.repairPalScore && (
                  <span className="ml-auto text-xs text-muted-foreground">RepairPal {data.repairPalScore}/5</span>
                )}
              </div>
            )}

            {/* Top problems */}
            {data.topProblems.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Known Issues</p>
                <ul className="space-y-0.5">
                  {data.topProblems.slice(0, 3).map((p, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="shrink-0 mt-0.5">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Expert consensus */}
            {data.expertConsensus && (
              <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2 leading-relaxed">
                {data.expertConsensus}
              </p>
            )}

            {/* Sources + age */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>{data.sources.join(' + ')}</span>
              <span suppressHydrationWarning>{formatAge(data.checkedAt)}</span>
            </div>

            {/* Full market intel report */}
            {data.marketIntelReport && (
              <div className="border-t pt-2">
                <button
                  onClick={() => setShowReport(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary w-full text-left"
                >
                  {showReport ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showReport ? 'Hide' : 'View'} Full Market Analysis
                </button>
                {showReport && (
                  <div className="mt-2 max-h-96 overflow-y-auto pr-1">
                    <MarkdownReport text={data.marketIntelReport} />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* AI Description section */}
        {!isSold && (
          <div className="pt-2 border-t space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">AI Listing Description</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={generateDescription}
                disabled={descLoading}
                className="h-7 px-2 text-xs"
              >
                {descLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : description ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {description && (
              <div className="relative">
                <p className="text-sm leading-relaxed text-foreground pr-8">{description}</p>
                <button
                  onClick={copyDescription}
                  className="absolute top-0 right-0 p-1 text-muted-foreground hover:text-foreground"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PriceTile({
  label, sublabel, price, color, highlight,
}: {
  label: string; sublabel: string; price: number | null; color: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-lg p-2.5 ${color} ${highlight ? 'ring-1 ring-green-400/30' : ''}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-xs opacity-70 mb-1">{sublabel}</p>
      <p className={`font-bold ${highlight ? 'text-base' : 'text-sm'}`}>
        {price ? formatCurrency(price) : '—'}
      </p>
    </div>
  )
}

function formatAge(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1)  return 'Updated just now'
  if (h < 24) return `Updated ${Math.floor(h)}h ago`
  const d = Math.floor(h / 24)
  return `Updated ${d} day${d !== 1 ? 's' : ''} ago`
}

/** Markdown renderer — handles ## headings, - bullets, pipe tables, **bold**, *italic* */
function MarkdownReport({ text }: { text: string }) {
  const lines = text.replace(/<br\s*\/?>/gi, '\n').split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // Pipe table: collect all consecutive pipe lines
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim())
        i++
      }
      // Parse: first row = header, rows with only dashes = separator (skip), rest = body
      const rows = tableLines
        .filter(l => !/^\|[-| :]+\|$/.test(l))
        .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      if (rows.length > 0) {
        const [head, ...body] = rows
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {head.map((cell, ci) => (
                    <th key={ci} className="text-left font-semibold text-foreground border-b border-border px-2 py-1 bg-muted/40">
                      {inlineFormat(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-muted/20'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="text-muted-foreground border-b border-border/40 px-2 py-1 align-top">
                        {inlineFormat(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (!trimmed) {
      elements.push(<div key={i} className="h-1" />)
    } else if (trimmed.startsWith('### ')) {
      elements.push(
        <p key={i} className="text-xs font-semibold text-foreground mt-2 mb-0.5">
          {inlineFormat(trimmed.slice(4))}
        </p>
      )
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <p key={i} className="text-xs font-bold text-foreground uppercase tracking-wide mt-3 mb-1 border-b pb-0.5">
          {inlineFormat(trimmed.slice(3))}
        </p>
      )
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0 mt-0.5">•</span>
          <span>{inlineFormat(trimmed.slice(2))}</span>
        </div>
      )
    } else if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      // Italicised line (e.g. *Target market: ...*) — render as muted italic intro
      elements.push(
        <p key={i} className="text-xs text-muted-foreground italic">
          {trimmed.slice(1, -1)}
        </p>
      )
    } else {
      elements.push(
        <p key={i} className="text-xs text-muted-foreground">
          {inlineFormat(trimmed)}
        </p>
      )
    }
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

/** Render inline **bold** and *italic* spans */
function inlineFormat(text: string): React.ReactNode {
  // Split on **bold** or *italic* tokens
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i} className="italic">{part.slice(1, -1)}</em>
        return part
      })}
    </>
  )
}
