'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import HelpButton from './HelpButton'
import HelpPanel from './HelpPanel'

/**
 * HelpSystemWrapper - Client-side container for Help button and panel.
 * Wraps both components and manages open/close state.
 * Safe to render in server layouts.
 */
export default function HelpSystemWrapper() {
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <HelpButton onOpenPanel={() => setIsPanelOpen(true)} />
      <HelpPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} currentPage={pathname} />
    </>
  )
}
