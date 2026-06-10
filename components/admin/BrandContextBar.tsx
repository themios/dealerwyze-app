'use client'

import { useVertical } from '@/hooks/useVertical'

/**
 * Persistent brand context indicator for admin pages.
 * Shows current brand scope so operators always know which product they're administering.
 */
export default function BrandContextBar() {
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'

  const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'
  const date = process.env.NEXT_PUBLIC_BUILD_DATE ?? ''

  return (
    <div className={`flex items-center justify-between px-4 py-1.5 text-xs font-semibold border-b ${
      isRE
        ? 'bg-violet-950 border-violet-800 text-violet-200'
        : 'bg-blue-950 border-blue-800 text-blue-200'
    }`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isRE ? 'bg-violet-400' : 'bg-blue-400'}`} />
        <span>
          {isRE ? 'RealtyWyze Admin' : 'DealerWyze Admin'} — viewing {isRE ? 'real estate agencies' : 'dealer accounts'} only
        </span>
      </div>
      <span className={`font-mono opacity-60 ${isRE ? 'text-violet-300' : 'text-blue-300'}`}>
        {sha}{date ? ` · ${date}` : ''}
      </span>
    </div>
  )
}
