'use client'

import { useState } from 'react'
import { Search, X, Home } from 'lucide-react'

interface Property {
  id: string
  mls_no: string
  address: string
  bedrooms: number | null
  bathrooms: number | null
}

interface PropertyLinkPickerProps {
  properties: Property[]
  value: string | null
  onChange: (id: string | null) => void
}

/**
 * Property picker component for RE orgs.
 * Similar to VehiclePicker but displays MLS#, address, and bed/bath.
 * Shows autocomplete search for MLS# and address matching.
 */
export default function PropertyLinkPicker({
  properties,
  value,
  onChange,
}: PropertyLinkPickerProps) {
  const [query, setQuery] = useState('')

  /**
   * Sanitize search query to prevent XSS and filter properties.
   * Note: Input component already handles escaping; this prevents script-like input.
   */
  const sanitizeQuery = (q: string): string => {
    // Allow alphanumeric, spaces, common address chars (hyphens, numbers, periods)
    return q.replace(/[<>{}[\]]/g, '').trim()
  }

  const filter = (list: Property[]) => {
    const sanitized = sanitizeQuery(query)
    return sanitized
      ? list.filter(p =>
          p.mls_no.toLowerCase().includes(sanitized.toLowerCase()) ||
          p.address.toLowerCase().includes(sanitized.toLowerCase())
        )
      : list
  }

  const filtered = filter(properties)
  const selected = properties.find(p => p.id === value)

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Search */}
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Search MLS# or address…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Clear selection */}
      {value && (
        <button
          onClick={() => onChange(null)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/30 border-b"
        >
          <X className="h-3.5 w-3.5" />
          Clear — {selected ? `${selected.mls_no} · ${selected.address}` : 'selected'}
        </button>
      )}

      {/* List */}
      <div className="max-h-52 overflow-y-auto divide-y">
        {filtered.length > 0 ? (
          filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onChange(p.id === value ? null : p.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors ${
                p.id === value ? 'bg-primary/5' : ''
              }`}
            >
              <div
                className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  p.id === value ? 'border-primary' : 'border-muted-foreground/30'
                }`}
              >
                {p.id === value && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <Home className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted-foreground">
                  MLS {p.mls_no}
                </p>
                <p className="text-xs truncate text-foreground">
                  {p.address}
                  {p.bedrooms !== null || p.bathrooms !== null ? (
                    <span className="text-muted-foreground ml-1">
                      · {p.bedrooms ?? '?'} bed / {p.bathrooms ?? '?'} bath
                    </span>
                  ) : null}
                </p>
              </div>
            </button>
          ))
        ) : (
          <p className="px-4 py-4 text-sm text-muted-foreground text-center">No properties match</p>
        )}
      </div>
    </div>
  )
}
