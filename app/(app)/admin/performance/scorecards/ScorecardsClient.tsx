'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type Scorecard = {
  repId: string
  repName: string
  avgFirstResponseMinutes: number
  replyRate: number
  conversionRate: number
  ghostRate: number
  avgTouchesBeforeClose: number
  avgTouchesBeforeLoss: number
  lostLeadTrend: { delta: number; direction: 'up' | 'down' | 'flat' }
  absoluteCounts: null | {
    leadsWorked: number
    appointmentsSet: number
    sold: number
    lost: number
  }
}

interface Props {
  self?: boolean
}

export default function ScorecardsClient({ self = false }: Props) {
  const [days, setDays] = useState(30)
  const [scorecards, setScorecards] = useState<Scorecard[]>([])
  const [loading, setLoading] = useState(true)

  async function load(nextDays = days) {
    setLoading(true)
    const params = new URLSearchParams({ days: String(nextDays) })
    if (self) params.set('self', 'true')
    const res = await fetch(`/api/admin/performance/scorecards?${params}`)
    const json = await res.json()
    setScorecards(json.scorecards ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex gap-2">
        {[7, 30, 90].map(option => (
          <Button
            key={option}
            size="sm"
            variant={days === option ? 'default' : 'outline'}
            onClick={() => { setDays(option); void load(option) }}
          >
            {option}d
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scorecards…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scorecards.map(card => (
            <div key={card.repId} className="rounded-xl border bg-card p-4 space-y-3">
              <div>
                <p className="text-lg font-semibold">{card.repName}</p>
                <p className="text-xs text-muted-foreground">
                  Lost trend: {card.lostLeadTrend.direction} {Math.abs(card.lostLeadTrend.delta)}%
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">First response</p>
                  <p className="font-medium">{card.avgFirstResponseMinutes} min</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reply rate</p>
                  <p className="font-medium">{card.replyRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Conversion</p>
                  <p className="font-medium">{card.conversionRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ghost rate</p>
                  <p className="font-medium">{card.ghostRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Touches before close</p>
                  <p className="font-medium">{card.avgTouchesBeforeClose}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Touches before loss</p>
                  <p className="font-medium">{card.avgTouchesBeforeLoss}</p>
                </div>
              </div>

              {card.absoluteCounts && (
                <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  Leads {card.absoluteCounts.leadsWorked} · Appointments {card.absoluteCounts.appointmentsSet} · Sold {card.absoluteCounts.sold} · Lost {card.absoluteCounts.lost}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
