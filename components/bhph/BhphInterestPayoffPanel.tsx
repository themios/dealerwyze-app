'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calculator, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { formatAprFromStored } from '@/lib/bhph/contractTerms'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatPayoffDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

type PayoffQuote = {
  asOfDate: string
  principalBalance: number
  accruedInterestToDate: number
  payoffTotal: number
  daysAccrued: number
  annualRatePercent: number
}

type PayoffPayload = {
  asOfDate: string
  principalBalance: number | null
  totalInterestPaid: number
  ytdInterestPaid: number
  payoff: PayoffQuote | null
}

interface Props {
  contractId: string
  interestRate: number | null | undefined
  canManage: boolean
}

export default function BhphInterestPayoffPanel({
  contractId,
  interestRate,
  canManage,
}: Props) {
  const router = useRouter()
  const [data, setData] = useState<PayoffPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [rebuildPending, startRebuild] = useTransition()
  const [futureDate, setFutureDate] = useState('')
  const [futurePayoff, setFuturePayoff] = useState<PayoffQuote | null>(null)
  const [futureError, setFutureError] = useState<string | null>(null)
  const [futurePending, startFuture] = useTransition()

  const load = useCallback(async (asOf?: string) => {
    setLoadError(null)
    try {
      const qs = asOf ? `?asOf=${encodeURIComponent(asOf)}` : ''
      const res = await fetch(`/api/bhph/${contractId}/payoff${qs}`, {
        credentials: 'same-origin',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof json.error === 'string' ? json.error : 'Could not load payoff'
        if (asOf) {
          setFutureError(msg)
          return null
        }
        setLoadError(msg)
        return null
      }
      const payload = json as PayoffPayload
      if (asOf) {
        if (!payload.payoff) {
          setFutureError('No principal balance to quote for this date.')
        }
        return payload.payoff
      }
      setData(payload)
      return payload.payoff
    } catch {
      const msg = 'Could not load payoff'
      if (asOf) {
        setFutureError(msg)
        return null
      }
      setLoadError(msg)
      return null
    }
  }, [contractId])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  function copyPayoffQuote(quote: PayoffQuote, label: string) {
    const text = [
      `${label} (${formatPayoffDateLabel(quote.asOfDate)})`,
      `Principal balance: ${fmt(quote.principalBalance)}`,
      `Accrued interest (${quote.daysAccrued} days): ${fmt(quote.accruedInterestToDate)}`,
      `Total payoff: ${fmt(quote.payoffTotal)}`,
      formatAprFromStored(interestRate),
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      toast.success('Payoff quote copied.')
    })
  }

  function calculateFuturePayoff() {
    const asOf = futureDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      toast.error('Choose a payoff date.')
      return
    }
    if (asOf < todayYmd()) {
      toast.error('Payoff date cannot be in the past.')
      return
    }

    setFutureError(null)
    startFuture(async () => {
      setFuturePayoff(null)
      const quote = await load(asOf)
      if (quote) {
        setFuturePayoff(quote)
      }
    })
  }

  function rebuildLedger() {
    startRebuild(async () => {
      try {
        const res = await fetch(`/api/bhph/${contractId}/rebuild-ledger`, {
          method: 'POST',
          credentials: 'same-origin',
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          toast.error(typeof json.error === 'string' ? json.error : 'Recalculate failed')
          return
        }
        toast.success(
          `Interest recalculated. Total interest paid: ${fmt(json.totalInterestPaid)}.`,
        )
        setFuturePayoff(null)
        await load()
        router.refresh()
      } catch {
        toast.error('Recalculate failed')
      }
    })
  }

  const rateSet = (interestRate ?? 0) > 0
  const minPayoffDate = todayYmd()

  return (
    <div className="bg-card border border-border rounded-[10px] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Interest &amp; payoff
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Simple daily accrual on principal; quote any payoff date from today onward
            </p>
          </div>
        </div>
        {canManage && rateSet && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rebuildPending}
            onClick={rebuildLedger}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${rebuildPending ? 'animate-spin' : ''}`} />
            Recalculate
          </Button>
        )}
      </div>

      {pending && !data && <p className="text-sm text-muted-foreground">Loading…</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Interest paid (YTD)
              </p>
              <p className="font-semibold text-foreground tabular-nums">{fmt(data.ytdInterestPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Interest paid (total)
              </p>
              <p className="font-semibold text-foreground tabular-nums">{fmt(data.totalInterestPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Principal balance
              </p>
              <p className="font-semibold text-foreground tabular-nums">{fmt(data.principalBalance)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                Payoff today
              </p>
              <p className="font-semibold text-[var(--brand-orange)] tabular-nums">
                {data.payoff ? fmt(data.payoff.payoffTotal) : '—'}
              </p>
            </div>
          </div>

          {data.payoff && rateSet && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p>
                Unpaid accrued interest ({data.payoff.daysAccrued} days since last payment):{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {fmt(data.payoff.accruedInterestToDate)}
                </span>
              </p>
              <p>
                Payoff today = principal {fmt(data.payoff.principalBalance)} + accrued{' '}
                {fmt(data.payoff.accruedInterestToDate)} ={' '}
                <span className="font-semibold text-foreground">{fmt(data.payoff.payoffTotal)}</span>
              </p>
            </div>
          )}

          {rateSet && data.payoff && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Payoff on a future date</p>
              <p className="text-[11px] text-muted-foreground">
                Pick when the customer plans to pay off (e.g. five days from today). Interest accrues
                through that date on the current principal balance.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor="bhph-payoff-date"
                    className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1"
                  >
                    Payoff date
                  </label>
                  <Input
                    id="bhph-payoff-date"
                    type="date"
                    min={minPayoffDate}
                    value={futureDate}
                    onChange={(e) => {
                      setFutureDate(e.target.value)
                      setFuturePayoff(null)
                      setFutureError(null)
                    }}
                    className="text-sm"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={futurePending || !futureDate}
                  onClick={calculateFuturePayoff}
                  className="shrink-0"
                >
                  {futurePending ? 'Calculating…' : 'Calculate payoff'}
                </Button>
              </div>

              {futureError && <p className="text-xs text-destructive">{futureError}</p>}

              {futurePayoff && (
                <div className="rounded-md bg-muted/40 border border-border px-3 py-2 space-y-2 text-xs">
                  <p className="font-medium text-foreground">
                    Payoff on {formatPayoffDateLabel(futurePayoff.asOfDate)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Principal</p>
                      <p className="font-semibold tabular-nums">{fmt(futurePayoff.principalBalance)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Accrued ({futurePayoff.daysAccrued} days)
                      </p>
                      <p className="font-semibold tabular-nums">
                        {fmt(futurePayoff.accruedInterestToDate)}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Total payoff
                      </p>
                      <p className="font-semibold text-[var(--brand-orange)] tabular-nums text-sm">
                        {fmt(futurePayoff.payoffTotal)}
                      </p>
                    </div>
                  </div>
                  {data.payoff && futurePayoff.asOfDate > data.payoff.asOfDate && (
                    <p className="text-muted-foreground">
                      {fmt(futurePayoff.payoffTotal - data.payoff.payoffTotal)} more than payoff today
                      ({futurePayoff.daysAccrued - data.payoff.daysAccrued} extra day
                      {futurePayoff.daysAccrued - data.payoff.daysAccrued === 1 ? '' : 's'} of interest).
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyPayoffQuote(futurePayoff, 'Payoff quote')
                    }
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy quote for customer
                  </Button>
                </div>
              )}
            </div>
          )}

          {!rateSet && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Set an interest rate under Contract terms to accrue interest on payments and generate payoff
              quotes.
            </p>
          )}

          {data.payoff && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => copyPayoffQuote(data.payoff!, 'Payoff quote (today)')}
            >
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copy payoff today
            </Button>
          )}
        </>
      )}
    </div>
  )
}
