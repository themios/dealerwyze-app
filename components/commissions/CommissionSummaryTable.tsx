'use client'

import { formatCurrency } from '@/lib/utils'

export interface CommissionSummaryRow {
  id: string
  transaction_number: string | null
  closing_date: string | null
  closing_price: number
  vehicle_address: string
  gross_commission: number
  listing_agent_amount: number
  buyer_agent_amount: number
  broker_amount: number
  role: 'listing_agent' | 'buyer_agent' | 'admin'
  listing_agent_name: string | null
  listing_agent_id: string | null
}

interface Props {
  transactions: CommissionSummaryRow[]
  isAdmin: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function RoleBadge({ role }: { role: CommissionSummaryRow['role'] }) {
  if (role === 'listing_agent') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
        Listing
      </span>
    )
  }
  if (role === 'buyer_agent') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-inset ring-green-600/10">
        Buyer
      </span>
    )
  }
  return null
}

/**
 * CommissionSummaryTable — per-deal commission breakdown.
 * Buyer Agent Amount column is hidden when no row has buyer_agent_amount > 0.
 */
export default function CommissionSummaryTable({ transactions, isAdmin }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        No closed transactions yet for this period.
      </div>
    )
  }

  const hasBuyerAgentAmount = transactions.some(t => t.buyer_agent_amount > 0)

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Property</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Txn #</th>
              {isAdmin && (
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
              )}
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Sale Price</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gross Comm.</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Agent Amt</th>
              {hasBuyerAgentAmount && (
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Buyer Agent</th>
              )}
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Broker Amt</th>
              {!isAdmin && (
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Role</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.map(row => (
              <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {formatDate(row.closing_date)}
                </td>
                <td className="px-4 py-3 max-w-[200px] truncate font-medium" title={row.vehicle_address}>
                  {row.vehicle_address}
                </td>
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {row.transaction_number ?? '--'}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {row.listing_agent_name ?? '--'}
                  </td>
                )}
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatCurrency(row.closing_price)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatCurrency(row.gross_commission)}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-foreground">
                  {formatCurrency(row.listing_agent_amount)}
                </td>
                {hasBuyerAgentAmount && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {row.buyer_agent_amount > 0 ? formatCurrency(row.buyer_agent_amount) : '--'}
                  </td>
                )}
                <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                  {formatCurrency(row.broker_amount)}
                </td>
                {!isAdmin && (
                  <td className="px-4 py-3 text-center">
                    <RoleBadge role={row.role} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {transactions.map(row => (
          <div key={row.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm leading-snug">{row.vehicle_address}</p>
              {!isAdmin && <RoleBadge role={row.role} />}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(row.closing_date)}
              {row.transaction_number ? ` · ${row.transaction_number}` : ''}
            </p>
            {isAdmin && row.listing_agent_name && (
              <p className="text-xs text-muted-foreground">Agent: {row.listing_agent_name}</p>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm pt-1">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Sale Price</p>
                <p className="font-medium">{formatCurrency(row.closing_price)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Gross Comm.</p>
                <p className="font-medium">{formatCurrency(row.gross_commission)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Agent Amt</p>
                <p className="font-semibold text-foreground">{formatCurrency(row.listing_agent_amount)}</p>
              </div>
              {row.buyer_agent_amount > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Buyer Agent</p>
                  <p className="font-medium">{formatCurrency(row.buyer_agent_amount)}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Broker Amt</p>
                <p className="font-medium text-muted-foreground">{formatCurrency(row.broker_amount)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
