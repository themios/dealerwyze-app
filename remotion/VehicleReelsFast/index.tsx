import React from 'react'
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Audio,
  Img,
  Sequence,
  AbsoluteFill,
} from 'remotion'
import { VehicleVideoProps, DEFAULT_PROPS } from '../types'

// 9:16 vertical (portrait), 25 seconds @ 30fps = 750 frames
export const TEMPLATE_DURATION = 750

const DARK   = '#090e1a'
const GREEN  = '#22c55e'
const WHITE  = '#ffffff'
const YELLOW = '#facc15'

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

function FullPhoto({
  src,
  startFrame,
  durationFrames,
  zoomIn = true,
}: {
  src: string
  startFrame: number
  durationFrames: number
  zoomIn?: boolean
}) {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame
  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = zoomIn
    ? interpolate(progress, [0, 1], [1.0, 1.1])
    : interpolate(progress, [0, 1], [1.1, 1.0])

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          // Maximum vibrancy
          filter: 'brightness(1.1) contrast(1.1) saturate(1.5)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-120 frames = 4s): Punchy title slam
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const photo = props.photos[0] || ''

  const slamSpring = spring({ frame, fps, config: { damping: 12, stiffness: 140 } })
  const slamScale = interpolate(slamSpring, [0, 1], [1.4, 1.0])
  const slamOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })

  const subOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {photo && <FullPhoto src={photo} startFrame={0} durationFrames={120} zoomIn />}
      {/* Full dark overlay for title scene */}
      <AbsoluteFill style={{ background: 'rgba(9,14,26,0.55)' }} />
      {/* Bottom gradient */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(9,14,26,0.95) 0%, transparent 55%)' }} />
      {/* Top gradient */}
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(9,14,26,0.7) 0%, transparent 35%)' }} />

      {/* Dealer badge — top */}
      <div style={{ position: 'absolute', top: 48, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          backgroundColor: GREEN,
          borderRadius: 20,
          paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 16,
        }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: WHITE, fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {props.dealerName}
          </p>
        </div>
      </div>

      {/* Big slam title */}
      <div style={{
        position: 'absolute', bottom: 80, left: 28, right: 28,
        opacity: slamOpacity, transform: `scale(${slamScale})`,
        transformOrigin: 'bottom left',
      }}>
        <h1 style={{ fontSize: 60, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.0, margin: 0 }}>
          {props.year} {props.make}
        </h1>
        <h1 style={{ fontSize: 60, fontWeight: 900, color: GREEN, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.0, margin: 0 }}>
          {props.model}
        </h1>
      </div>
      <div style={{ position: 'absolute', bottom: 44, left: 28, opacity: subOpacity }}>
        {props.trim && (
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', fontFamily: 'system-ui, sans-serif' }}>
            {props.trim}
          </p>
        )}
      </div>
    </AbsoluteFill>
  )
}

// Scene 2 (120-570 frames = 15s): Fast-cut photos (6 photos × 75 frames = 2.5s each)
const FAST_CAPTIONS = [
  (p: VehicleVideoProps) => `${p.mileage.toLocaleString()} miles`,
  (p: VehicleVideoProps) => p.color ? `${p.color} exterior` : `${p.year} ${p.make}`,
  (p: VehicleVideoProps) => p.trim || p.model,
  (p: VehicleVideoProps) => p.features[0] || 'Dealer Inspected',
  (p: VehicleVideoProps) => p.features[1] || 'Clean Carfax',
  (p: VehicleVideoProps) => p.engine || 'Available Now',
]

function Scene2({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 120

  const photos = [...props.photos.slice(0, 6)]
  while (photos.length < 6) photos.push(props.photos[0] || '')

  const photoIndex = Math.max(0, Math.min(Math.floor(localFrame / 75), 5))
  const photoLocalFrame = localFrame - photoIndex * 75
  const currentPhoto = photos[photoIndex]
  const caption = FAST_CAPTIONS[photoIndex](props)

  // Flash cut: brief fade
  const flashIn = interpolate(photoLocalFrame, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const captionOpacity = interpolate(photoLocalFrame, [6, 22], [0, 1], { extrapolateRight: 'clamp' })
  const captionY = interpolate(photoLocalFrame, [6, 22], [20, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      <div style={{ opacity: flashIn, position: 'absolute', inset: 0 }}>
        {currentPhoto && (
          <FullPhoto
            src={currentPhoto}
            startFrame={120 + photoIndex * 75}
            durationFrames={75}
            zoomIn={photoIndex % 2 === 0}
          />
        )}
      </div>

      {/* Top progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4,
        display: 'flex', gap: 3, padding: '0 16px', paddingTop: 12 }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            backgroundColor: i < photoIndex
              ? GREEN
              : i === photoIndex
              ? 'rgba(255,255,255,0.85)'
              : 'rgba(255,255,255,0.25)',
          }} />
        ))}
      </div>

      {/* Vehicle name top */}
      <div style={{ position: 'absolute', top: 28, left: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif',
          textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
          {props.year} {props.make} {props.model}
        </p>
      </div>

      {/* Bottom gradient */}
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(9,14,26,0.9) 0%, transparent 50%)' }} />

      {/* Caption */}
      <div style={{
        position: 'absolute', bottom: 40, left: 24, right: 24,
        opacity: captionOpacity,
        transform: `translateY(${captionY}px)`,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(0,0,0,0.6)',
          borderRadius: 10,
          paddingTop: 10, paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
          borderLeft: `4px solid ${GREEN}`,
        }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
            {caption}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (570-750 frames = 6s): Punchy CTA
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 570
  const { fps } = useVideoConfig()

  const punchSpring = spring({ frame: Math.max(0, localFrame - 5), fps, config: { damping: 12, stiffness: 120 } })
  const punchScale = interpolate(punchSpring, [0, 1], [0.6, 1.0])
  const punchOpacity = interpolate(localFrame, [5, 25], [0, 1], { extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(localFrame, [30, 55], [0, 1], { extrapolateRight: 'clamp' })
  const ctaY = interpolate(localFrame, [30, 55], [24, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, ${DARK} 0%, #0d1520 50%, #111827 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Green accent line */}
      <div style={{ width: 56, height: 4, backgroundColor: GREEN, borderRadius: 2, marginBottom: 24 }} />

      <div style={{ opacity: punchOpacity, transform: `scale(${punchScale})`, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.1em', marginBottom: 4 }}>
          {props.year} {props.make} {props.model}
        </p>
        {props.showPrice && props.price > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: YELLOW, fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>
              Asking Price
            </p>
            <p style={{ fontSize: 68, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>
              {formatPrice(props.price)}
            </p>
          </>
        )}
      </div>

      <div style={{
        opacity: ctaOpacity, transform: `translateY(${ctaY}px)`,
        textAlign: 'center', marginTop: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        {props.showPhone && (
          <div style={{
            backgroundColor: GREEN, borderRadius: 16,
            paddingTop: 16, paddingBottom: 16, paddingLeft: 36, paddingRight: 36,
          }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
              {props.dealerPhone}
            </p>
          </div>
        )}
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif' }}>
          {props.dealerName}
          {props.dealerCity ? ` | ${props.dealerCity}` : ''}
        </p>
        {props.dealerWebsite && (
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'system-ui, sans-serif' }}>
            {props.dealerWebsite}
          </p>
        )}
      </div>

      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 20, right: 20 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            DealerWyze
          </p>
        </div>
      )}
    </AbsoluteFill>
  )
}

export function VehicleReelsFast(rawProps: Partial<VehicleVideoProps>) {
  const props: VehicleVideoProps = { ...DEFAULT_PROPS, ...rawProps }
  return (
    <AbsoluteFill style={{ backgroundColor: DARK, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sequence from={0} durationInFrames={120}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={120} durationInFrames={450}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={570} durationInFrames={180}>
        <Scene3 props={props} />
      </Sequence>
      {props.narrationUrl && <Audio src={props.narrationUrl} />}
    </AbsoluteFill>
  )
}
