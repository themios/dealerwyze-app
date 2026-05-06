'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

interface Props {
  makes: string[]
  currentMake?: string
  currentMin?: string
  currentMax?: string
  currentQ?: string
}

export default function InventoryFilters({ makes, currentMake, currentMin, currentMax, currentQ }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const buildParams = useCallback((overrides: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = {
      make: currentMake,
      min: currentMin,
      max: currentMax,
      q: currentQ,
    }
    const merged = { ...base, ...overrides }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v)
    }
    return params.toString()
  }, [currentMake, currentMin, currentMax, currentQ])

  const push = useCallback((key: string, value: string | undefined) => {
    const qs = buildParams({ [key]: value })
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, buildParams])

  const hasFilters = currentMake || currentMin || currentMax || currentQ

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Keyword search */}
      <input
        type="text"
        placeholder="Search make or model…"
        defaultValue={currentQ ?? ''}
        onBlur={e => push('q', e.target.value || undefined)}
        onKeyDown={e => {
          if (e.key === 'Enter') push('q', (e.target as HTMLInputElement).value || undefined)
        }}
        className="text-sm w-44 rounded-lg border border-[var(--dp-navy)]/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--dp-gold)]"
      />

      {/* Make filter */}
      <select
        value={currentMake ?? ''}
        onChange={e => push('make', e.target.value || undefined)}
        className="text-sm rounded-lg border border-[var(--dp-navy)]/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--dp-gold)]"
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
          defaultValue={currentMin ?? ''}
          onBlur={e => push('min', e.target.value || undefined)}
          onKeyDown={e => {
            if (e.key === 'Enter') push('min', (e.target as HTMLInputElement).value || undefined)
          }}
          className="text-sm w-28 rounded-lg border border-[var(--dp-navy)]/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--dp-gold)]"
        />
        <span className="text-sm text-[var(--dp-ink)]/35">–</span>
        <input
          type="number"
          placeholder="Max price"
          defaultValue={currentMax ?? ''}
          onBlur={e => push('max', e.target.value || undefined)}
          onKeyDown={e => {
            if (e.key === 'Enter') push('max', (e.target as HTMLInputElement).value || undefined)
          }}
          className="text-sm w-28 rounded-lg border border-[var(--dp-navy)]/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--dp-gold)]"
        />
      </div>

      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          className="text-sm font-medium text-[var(--dp-navy)] underline-offset-2 hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
