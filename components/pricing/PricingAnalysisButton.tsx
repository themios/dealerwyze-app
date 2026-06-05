'use client'

import { Zap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PricingAnalysisButtonProps {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
}

/**
 * Trigger button for pricing analysis modal.
 * Shows loading state while analysis is in progress.
 */
export default function PricingAnalysisButton({
  onClick,
  disabled = false,
  loading = false,
  className = '',
}: PricingAnalysisButtonProps) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Analyzing...
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 mr-2" />
          Analyze Price
        </>
      )}
    </Button>
  )
}
