'use client'

import { useState, useEffect } from 'react'

export interface OrgSettings {
  dealerName:    string
  dealerPhone:   string
  dealerAddress: string
}

const DEFAULT: OrgSettings = { dealerName: 'the dealership', dealerPhone: '', dealerAddress: '' }

// Module-level cache — one fetch per page load across all components
let _promise: Promise<OrgSettings> | null = null
let _cached:  OrgSettings | null = null

export function useOrgSettings(): OrgSettings {
  const [settings, setSettings] = useState<OrgSettings>(_cached ?? DEFAULT)

  useEffect(() => {
    if (_cached) {
      setSettings(_cached)
      return
    }
    if (!_promise) {
      _promise = fetch('/api/settings/org')
        .then(r => r.ok ? r.json() : null)
        .then((data: Record<string, string | null> | null) => {
          const s: OrgSettings = {
            dealerName:    data?.business_name ?? data?.name ?? 'the dealership',
            dealerPhone:   data?.dealer_cell_number ?? '',
            dealerAddress: data?.business_address ?? '',
          }
          _cached = s
          return s
        })
        .catch(() => DEFAULT)
    }
    _promise.then(s => setSettings(s))
  }, [])

  return settings
}
