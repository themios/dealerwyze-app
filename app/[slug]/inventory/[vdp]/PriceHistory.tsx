interface PriceEntry {
  price: number
  changed_at: string
}

interface Props {
  history: PriceEntry[]
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PriceHistory({ history }: Props) {
  const sorted = [...history].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Price History</h2>
      </div>
      <ul className="divide-y divide-gray-100">
        {sorted.map((entry, i) => {
          const prev = sorted[i + 1]
          const dropped = prev && entry.price < prev.price
          const raised  = prev && entry.price > prev.price

          return (
            <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-gray-500">{formatDate(entry.changed_at)}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{formatPrice(entry.price)}</span>
                {dropped && (
                  <span className="text-xs text-green-600 flex items-center gap-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Price drop
                  </span>
                )}
                {raised && (
                  <span className="text-xs text-gray-400 flex items-center gap-0.5">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    Increased
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
