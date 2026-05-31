'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useVertical } from '@/lib/vertical'

export default function BetaBanner() {
  const { vertical, brandName } = useVertical()
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const supportEmail = vertical === 'real_estate' ? 'support@realtywyze.us' : 'support@dealerwyze.com'

  return (
    <div className="relative z-40 w-full px-4 py-2.5 flex items-center justify-center gap-3 text-sm font-medium"
      style={{ backgroundColor: '#FFF7ED', borderBottom: '1.5px solid #FDBA74', color: '#9A3412' }}>
      <span className="text-base leading-none">🧪</span>
      <span>
        <strong>Beta:</strong> {brandName} is in active testing. Features may change.
        Found a bug or have a suggestion?{' '}
        <a href={`mailto:${supportEmail}`}
          className="underline underline-offset-2 font-semibold hover:opacity-70 transition-opacity"
          style={{ color: '#7C2D12' }}>
          Tell us
        </a>
        {' '}— it directly shapes the product.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-orange-100 transition-colors"
        aria-label="Dismiss beta notice">
        <X className="w-3.5 h-3.5" style={{ color: '#9A3412' }} />
      </button>
    </div>
  )
}
