'use client'

import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, TrendingUp, Gift } from 'lucide-react'

interface TopReferrer {
  customer_id:      string
  name:             string
  referral_count:   number
  last_referral_at: string
}

interface SourceItem {
  source: string
  count:  number
}

interface Props {
  totalReferred:   number
  topReferrers:    TopReferrer[]
  sourceBreakdown: SourceItem[]
}

export default function ReferralsClient({ totalReferred, topReferrers, sourceBreakdown }: Props) {
  const router = useRouter()

  if (totalReferred === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Gift className="mx-auto mb-3 opacity-30" size={40} />
        <p className="font-medium">No referrals tracked yet.</p>
        <p className="text-sm mt-1">When you mark a customer as referred by someone, they will show up here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users size={14} />
              <span className="text-xs">Total Referred</span>
            </div>
            <p className="text-2xl font-bold">{totalReferred}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp size={14} />
              <span className="text-xs">Top Referrers</span>
            </div>
            <p className="text-2xl font-bold">{topReferrers.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Referrers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Top Referrers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topReferrers.map((r, i) => (
            <button
              key={r.customer_id}
              onClick={() => router.push(`/customers/${r.customer_id}`)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors border-b last:border-0 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                <div>
                  <p className="font-medium text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Last referral: {new Date(r.last_referral_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">{r.referral_count} referral{r.referral_count !== 1 ? 's' : ''}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Source Breakdown */}
      {sourceBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Referral Source</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sourceBreakdown.map(s => (
              <div key={s.source} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                <span className="text-sm capitalize">{s.source}</span>
                <Badge variant="outline">{s.count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
