'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import {
  getVerticalConfig,
  dealerConfig,
  type Vertical,
  type VerticalConfig,
  type VerticalLabels,
} from '@/lib/vertical'

const VerticalContext = createContext<VerticalConfig>(dealerConfig)

interface VerticalProviderProps {
  vertical: Vertical
  children: ReactNode
}

export function VerticalProvider({ vertical, children }: VerticalProviderProps) {
  const config = getVerticalConfig(vertical)
  return (
    <VerticalContext.Provider value={config}>
      {children}
    </VerticalContext.Provider>
  )
}

export function useVertical(): VerticalConfig {
  return useContext(VerticalContext)
}

export function useLabels(): VerticalLabels {
  return useContext(VerticalContext).labels
}
