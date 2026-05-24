/**
 * RealtyWyzeLogo — inline SVG reproduction of the RW brand mark.
 * No external file dependency. Matches the navy/orange color system.
 *
 * Props:
 *   variant  "full"   — RW mark + "RealtyWyze.US" wordmark (default)
 *            "mark"   — RW mark only (square, good for favicon / small spaces)
 *   width    px width (height scales proportionally)
 *   white    invert to all-white (for dark backgrounds)
 *   className
 */

interface Props {
  variant?: 'full' | 'mark'
  width?: number
  white?: boolean
  className?: string
}

const NAVY   = '#0D2B55'
const ORANGE = '#F07018'

export default function RealtyWyzeLogo({
  variant = 'full',
  width = 160,
  white = false,
  className = '',
}: Props) {
  const navy   = white ? '#ffffff' : NAVY
  const orange = white ? '#ffffff' : ORANGE

  if (variant === 'mark') {
    // Square mark — just the RW + swoosh arrow, no wordmark
    const h = Math.round(width * 0.75)
    return (
      <svg
        width={width}
        height={h}
        viewBox="0 0 100 75"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="RealtyWyze"
      >
        {/* R */}
        <text x="2" y="58" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="58" fill={navy}>R</text>
        {/* W */}
        <text x="46" y="58" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="58" fill={navy}>W</text>
        {/* Orange swoosh arrow */}
        <path
          d="M6 68 Q30 45 55 28 Q70 18 92 8"
          stroke={orange} strokeWidth="7" fill="none" strokeLinecap="round"
        />
        {/* Arrow head */}
        <polygon points="92,8 82,6 88,16" fill={orange} />
        {/* Shadow / depth on swoosh */}
        <path
          d="M6 72 Q30 50 55 33 Q70 23 90 14"
          stroke={orange} strokeWidth="3" strokeOpacity="0.35" fill="none" strokeLinecap="round"
        />
      </svg>
    )
  }

  // Full lockup — mark + wordmark
  // ViewBox: 220 wide × 130 tall
  const h = Math.round(width * (130 / 220))
  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 220 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="RealtyWyze"
    >
      {/* ── Mark ── */}
      {/* R */}
      <text x="4"  y="72" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="72" fill={navy}>R</text>
      {/* W */}
      <text x="102" y="72" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="72" fill={navy}>W</text>

      {/* Orange swoosh */}
      <path
        d="M10 80 Q55 55 105 34 Q148 16 208 4"
        stroke={orange} strokeWidth="9" fill="none" strokeLinecap="round"
      />
      {/* Arrow head */}
      <polygon points="208,4 194,2 200,14" fill={orange} />
      {/* Shadow depth on swoosh */}
      <path
        d="M10 86 Q55 62 105 42 Q148 24 205 13"
        stroke={orange} strokeWidth="4" strokeOpacity="0.30" fill="none" strokeLinecap="round"
      />

      {/* ── Wordmark ── */}
      {/* "RealtyWyze" in navy */}
      <text
        x="4" y="118"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="28"
        fill={navy}
        letterSpacing="-0.5"
      >
        RealtyWyze
      </text>
      {/* ".US" in orange */}
      <text
        x="167" y="118"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="28"
        fill={orange}
      >
        .US
      </text>
    </svg>
  )
}
