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

// 9:16 vertical, 30 seconds @ 30fps = 900 frames
// Width: 720, Height: 1280
export const TEMPLATE_DURATION = 900

const DARK   = '#0f172a'
const ORANGE = '#f97316'
const WHITE  = '#ffffff'

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

// Full-screen photo with Ken Burns
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
          filter: 'brightness(1.08) contrast(1.05) saturate(1.3)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-240 frames = 8s): Full-screen hero + dealer badge
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const badgeSpring = spring({ frame, fps, config: { damping: 16, stiffness: 100 } })
  const badgeY = interpolate(badgeSpring, [0, 1], [-60, 0])

  const titleOpacity = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: 'clamp' })
  const titleY = interpolate(frame, [30, 60], [30, 0], { extrapolateRight: 'clamp' })

  const photo = props.photos[0] || ''

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {photo && <FullPhoto src={photo} startFrame={0} durationFrames={240} zoomIn />}
      {/* Bottom gradient */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to top, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.6) 40%, transparent 70%)',
      }} />
      {/* Top gradient */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(15,23,42,0.7) 0%, transparent 30%)',
      }} />

      {/* Dealer badge — top right */}
      <div style={{
        position: 'absolute', top: 40, right: 28,
        transform: `translateY(${badgeY}px)`,
      }}>
        <div style={{
          backgroundColor: ORANGE,
          borderRadius: 10,
          paddingTop: 8, paddingBottom: 8, paddingLeft: 14, paddingRight: 14,
        }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: WHITE,
            fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
            {props.dealerName}
          </p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)',
            fontFamily: 'system-ui, sans-serif', textAlign: 'center', marginTop: 1 }}>
            {props.dealerCity}, {props.dealerState}
          </p>
        </div>
      </div>

      {/* Bottom text */}
      <div style={{
        position: 'absolute', bottom: 60, left: 32, right: 32,
        opacity: titleOpacity, transform: `translateY(${titleY}px)`,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 8 }}>
          Just Listed
        </p>
        <p style={{ fontSize: 48, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.05, margin: 0 }}>
          {props.year} {props.make}
        </p>
        <p style={{ fontSize: 48, fontWeight: 900, color: ORANGE, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.05, margin: 0 }}>
          {props.model}
        </p>
      </div>
    </AbsoluteFill>
  )
}

// Scene 2 (240-600 frames = 12s): 3-photo vertical slideshow with price
function Scene2({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 240

  const photos = props.photos.slice(1, 4)
  while (photos.length < 3) photos.push(props.photos[0] || '')

  // Which photo to show (4s each = 120 frames each)
  const photoIndex = Math.min(Math.floor(localFrame / 120), 2)
  const currentPhoto = photos[photoIndex]

  const priceOpacity = interpolate(localFrame, [30, 70], [0, 1], { extrapolateRight: 'clamp' })

  const specsItems = [
    `${props.mileage.toLocaleString()} miles`,
    props.color || props.make,
    props.trim || String(props.year),
  ]

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {currentPhoto && <FullPhoto src={currentPhoto} startFrame={240 + photoIndex * 120} durationFrames={120} zoomIn={photoIndex % 2 === 0} />}
      <AbsoluteFill style={{
        background: 'linear-gradient(to top, rgba(15,23,42,0.97) 0%, rgba(15,23,42,0.3) 50%, transparent 100%)',
      }} />

      {/* Price pill - prominent */}
      <div style={{
        position: 'absolute', top: 40, left: 32,
        opacity: priceOpacity,
      }}>
        {props.showPrice && (
          <div style={{
            backgroundColor: 'rgba(249,115,22,0.95)',
            borderRadius: 14,
            paddingTop: 10, paddingBottom: 10, paddingLeft: 18, paddingRight: 18,
          }}>
            <p style={{ fontSize: 30, fontWeight: 900, color: WHITE,
              fontFamily: 'system-ui, sans-serif' }}>
              {formatPrice(props.price)}
            </p>
          </div>
        )}
      </div>

      {/* Photo counter dots */}
      <div style={{
        position: 'absolute', top: 64, right: 28,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            backgroundColor: i === photoIndex ? ORANGE : 'rgba(255,255,255,0.35)',
          }} />
        ))}
      </div>

      {/* Bottom specs */}
      <div style={{ position: 'absolute', bottom: 60, left: 32, right: 32 }}>
        <p style={{ fontSize: 24, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif', marginBottom: 14 }}>
          {props.year} {props.make} {props.model}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {specsItems.map((spec, i) => (
            <div key={i} style={{
              backgroundColor: 'rgba(255,255,255,0.12)',
              borderRadius: 8,
              paddingTop: 5, paddingBottom: 5, paddingLeft: 10, paddingRight: 10,
            }}>
              <p style={{ fontSize: 13, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>{spec}</p>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (600-900 frames = 10s): Big price + phone CTA + swipe hint
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 600
  const { fps } = useVideoConfig()

  const priceSpring = spring({ frame: Math.max(0, localFrame - 10), fps, config: { damping: 14, stiffness: 85 } })
  const priceScale = interpolate(priceSpring, [0, 1], [0.5, 1])

  const ctaOpacity = interpolate(localFrame, [40, 80], [0, 1], { extrapolateRight: 'clamp' })

  const swipeOpacity = interpolate(
    localFrame,
    [60, 90, 150, 180],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  )
  const swipeY = interpolate(
    localFrame,
    [60, 90, 150, 180],
    [10, 0, 0, -10],
    { extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, ${DARK} 0%, #1e293b 50%, #0f172a 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Orange accent */}
      <div style={{ width: 64, height: 4, backgroundColor: ORANGE, borderRadius: 2, marginBottom: 32 }} />

      <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>
        {props.year} {props.make} {props.model}
        {props.trim ? ` ${props.trim}` : ''}
      </p>

      {props.showPrice && (
        <div style={{ transform: `scale(${priceScale})`, marginBottom: 40 }}>
          <p style={{ fontSize: 72, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif',
            textAlign: 'center', lineHeight: 1 }}>
            {formatPrice(props.price)}
          </p>
        </div>
      )}

      <div style={{ opacity: ctaOpacity, alignItems: 'center', display: 'flex', flexDirection: 'column' }}>
        {props.showPhone && (
          <p style={{ fontSize: 22, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif',
            textAlign: 'center', marginBottom: 8 }}>
            {props.dealerPhone}
          </p>
        )}
        <p style={{ fontSize: 15, color: ORANGE, fontFamily: 'system-ui, sans-serif',
          textAlign: 'center', fontWeight: 600 }}>
          {props.dealerName}
        </p>
        {props.dealerWebsite && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'system-ui, sans-serif',
            textAlign: 'center', marginTop: 4 }}>
            {props.dealerWebsite}
          </p>
        )}
      </div>

      {/* Swipe hint */}
      <div style={{
        position: 'absolute', bottom: 40,
        opacity: swipeOpacity, transform: `translateY(${swipeY}px)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1 }}>^</p>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          View more
        </p>
      </div>

      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 16, right: 20 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            DealerWyze
          </p>
        </div>
      )}
    </AbsoluteFill>
  )
}

// Main composition
export function VehicleReelsPortrait(rawProps: Partial<VehicleVideoProps>) {
  const props: VehicleVideoProps = { ...DEFAULT_PROPS, ...rawProps }
  return (
    <AbsoluteFill style={{ backgroundColor: DARK, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sequence from={0} durationInFrames={240}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={240} durationInFrames={360}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={600} durationInFrames={300}>
        <Scene3 props={props} />
      </Sequence>
      {props.narrationUrl && <Audio src={props.narrationUrl} />}
    </AbsoluteFill>
  )
}
