'use client'
import { useEffect } from 'react'

export type FontSize = 'sm' | 'md' | 'lg' | 'xl'

export default function FontSizeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = (localStorage.getItem('apollo-font-size') as FontSize) || 'md'
    document.documentElement.setAttribute('data-font-size', saved)
  }, [])
  return <>{children}</>
}
