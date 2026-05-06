'use client'

import { useSyncExternalStore } from 'react'

interface Props {
  /** Already formatted for display (e.g. from `formatVin`) */
  display: string
}

const noopSubscribe = () => () => {}

/**
 * Renders the VIN line only after mount. Some browser extensions (e.g. Autoniq)
 * inject DOM around 17-char VINs during initial load, which breaks React hydration
 * if the full VIN is present in the server-rendered HTML.
 */
export default function VehicleVinLine({ display }: Props) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)

  if (!mounted) {
    return (
      <p
        className="text-xs text-muted-foreground font-mono"
        aria-label={display === '—' ? 'VIN not set' : `VIN ${display}`}
      >
        VIN: …
      </p>
    )
  }

  return (
    <p className="text-xs text-muted-foreground font-mono">
      VIN: {display}
    </p>
  )
}
