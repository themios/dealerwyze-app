'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Props {
  makes: string[]
  currentMake?: string
  currentMin?: string
  currentMax?: string
}

export default function InventoryFilters({ makes, currentMake, currentMin, currentMax }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const updateFilter = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams()
    if (currentMake) params.set('make', currentMake)
    if (currentMin) params.set('min', currentMin)
    if (currentMax) params.set('max', currentMax)

    if (value) params.set(key, value)
    else params.delete(key)

    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, currentMake, currentMin, currentMax])

  const hasFilters = currentMake || currentMin || currentMax

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Make filter */}
      <select
        value={currentMake ?? ''}
        onChange={e => updateFilter('make', e.target.value || undefined)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Makes</option>
        {makes.map(make => (
          <option key={make} value={make}>{make}</option>
        ))}
      </select>

      {/* Price range */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Min price"
          value={currentMin ?? ''}
          onChange={e => updateFilter('min', e.target.value || undefined)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400 text-sm">-</span>
        <input
          type="number"
          placeholder="Max price"
          value={currentMax ?? ''}
          onChange={e => updateFilter('max', e.target.value || undefined)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          className="text-sm text-blue-600 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
