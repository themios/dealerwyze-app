'use client'

import { useEffect, useState } from 'react'

/**
 * Hook to check if a media query matches in the current viewport.
 * Safe for SSR; defaults to false initially, then updates on mount.
 * @param query - CSS media query string (e.g., "(max-width: 768px)")
 * @returns boolean - true if query matches, false otherwise
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)

    // Set initial value
    setMatches(mediaQuery.matches)

    // Listen for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
