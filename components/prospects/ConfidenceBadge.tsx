'use client'

import { CONFIDENCE_COLORS, CONFIDENCE_LABELS } from './types'
import type { Confidence } from '@/lib/leads/visionIngestTypes'

interface ConfidenceBadgeProps {
  confidence: Confidence | null | undefined
  className?: string
}

/**
 * Reusable badge showing confidence level with color coding.
 * High = green, Medium = amber, Low = red
 */
export default function ConfidenceBadge({
  confidence,
  className = '',
}: ConfidenceBadgeProps) {
  if (!confidence) return null

  const colorClass = CONFIDENCE_COLORS[confidence]
  const label = CONFIDENCE_LABELS[confidence]

  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${colorClass} ${className}`}
    >
      {label}
    </span>
  )
}
