'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

interface BackButtonProps {
  href?: string
  label?: string
}

export default function BackButton({ href, label }: BackButtonProps) {
  const router = useRouter()

  function handleBack() {
    if (href) {
      router.push(href)
    } else {
      router.back()
    }
  }

  return (
    <button
      onClick={handleBack}
      className="flex items-center gap-0.5 text-white/80 hover:text-white transition-colors pr-2"
      aria-label="Go back"
    >
      <ChevronLeft className="h-5 w-5" />
      <span className="text-sm font-medium">{label ?? 'Back'}</span>
    </button>
  )
}
