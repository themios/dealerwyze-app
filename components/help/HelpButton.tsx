'use client'

import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

interface HelpButtonProps {
  onOpenPanel: () => void
}

/**
 * HelpButton - Help access point
 * Mobile: Small icon in top bar right section
 * Desktop: Floating "?" button in bottom-right corner
 */
export default function HelpButton({ onOpenPanel }: HelpButtonProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <>
      {/* Mobile: Fixed top-right, positioned below status bar and search area */}
      <Button
        onClick={onOpenPanel}
        className="lg:hidden fixed top-12 right-3 w-9 h-9 rounded-full p-0 shadow-md hover:shadow-lg transition-shadow z-20 bg-[#0D2B55] hover:bg-[#1B4A8A] text-white"
        title="Help"
        aria-label="Open help"
      >
        <HelpCircle className="w-5 h-5" />
      </Button>

      {/* Desktop: Floating button */}
      <Button
        onClick={onOpenPanel}
        className="hidden lg:flex fixed bottom-8 right-8 w-12 h-12 rounded-full p-0 shadow-lg hover:shadow-xl transition-shadow z-40"
        title="Help"
        aria-label="Open help"
      >
        <HelpCircle className="w-6 h-6" />
      </Button>
    </>
  )
}
