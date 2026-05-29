'use client'

import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

interface HelpButtonProps {
  onOpenPanel: () => void
}

/**
 * HelpButton - Floating "?" button in bottom-right corner.
 * Click opens the help panel. Always visible.
 */
export default function HelpButton({ onOpenPanel }: HelpButtonProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Button
      onClick={onOpenPanel}
      className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 w-12 h-12 rounded-full p-0 shadow-lg hover:shadow-xl transition-shadow z-40"
      title="Help"
      aria-label="Open help"
    >
      <HelpCircle className="w-6 h-6" />
    </Button>
  )
}
