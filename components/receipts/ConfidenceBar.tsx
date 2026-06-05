'use client'

/**
 * Confidence level thresholds for color coding.
 * HIGH = 0.7+, MEDIUM = 0.5-0.69, LOW = <0.5
 */
const CONFIDENCE_THRESHOLDS = {
  high: 0.7,
  medium: 0.5,
} as const

/**
 * Visual progress bar showing confidence level (0-1).
 * Used to display AI category recommendation confidence.
 */
export default function ConfidenceBar({
  confidence,
  label,
  className = '',
}: {
  confidence: number
  label?: string
  className?: string
}) {
  const percent = Math.min(Math.max(confidence * 100, 0), 100)
  const color =
    confidence >= CONFIDENCE_THRESHOLDS.high
      ? 'bg-green-500'
      : confidence >= CONFIDENCE_THRESHOLDS.medium
        ? 'bg-amber-500'
        : 'bg-red-500'

  return (
    <div className={className}>
      {label && (
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      )}
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${percent}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        {(confidence * 100).toFixed(0)}%
      </p>
    </div>
  )
}
