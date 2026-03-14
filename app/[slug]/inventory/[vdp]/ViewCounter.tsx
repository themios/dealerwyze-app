'use client'

import { useEffect } from 'react'

interface Props {
  vehicleId: string
}

// Fires once on mount to increment the view counter (non-blocking)
export default function ViewCounter({ vehicleId }: Props) {
  useEffect(() => {
    fetch(`/api/vehicles/${vehicleId}/view`, { method: 'POST' }).catch(() => {})
  }, [vehicleId])

  return null
}
