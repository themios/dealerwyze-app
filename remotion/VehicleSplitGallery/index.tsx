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

// 16:9, 40 seconds @ 30fps = 1200 frames
export const TEMPLATE_DURATION = 1200

const CHARCOAL = '#111827'
const ORANGE   = '#f97316'
const WHITE    = '#ffffff'
const AMBER    = '#fbbf24'

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

// Ken Burns with vivid filter
function KenBurns({
  src,
  startFrame,
  durationFrames,
  zoomDirection = 'in',
}: {
  src: string
  startFrame: number
  durationFrames: number
  zoomDirection?: 'in' | 'out'
}) {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame
  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = zoomDirection === 'in'
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
          filter: 'brightness(1.1) contrast(1.08) saturate(1.45)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-270 frames = 9s): Full hero + title slides in
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const photo = props.photos[0] || ''

  const titleSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 18, stiffness: 70 } })
  const titleX = interpolate(titleSpring, [0, 1], [-80, 0])
  const titleOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: 'clamp' })

  const badgeOpacity = interpolate(frame, [35, 65], [0, 1], { extrapolateRight: 'clamp' })
  const badgeX = interpolate(frame, [35, 65], [40, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: CHARCOAL }}>
      {photo && <KenBurns src={photo} startFrame={0} durationFrames={270} zoomDirection="in" />}
      {/* Left-side dark gradient for text legibility */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to right, rgba(17,24,39,0.78) 0%, rgba(17,24,39,0.38) 55%, rgba(17,24,39,0.05) 100%)',
      }} />
      {/* Bottom fade */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to top, rgba(17,24,39,0.6) 0%, transparent 40%)',
      }} />

      <AbsoluteFill style={{ padding: '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ opacity: titleOpacity, transform: `translateX(${titleX}px)`, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 10 }}>
            Just Listed
          </p>
          <h1 style={{ fontSize: 74, fontWeight: 900, color: WHITE, margin: 0, lineHeight: 1.0,
            fontFamily: 'system-ui, sans-serif' }}>
            {props.year} {props.make}
          </h1>
          <h1 style={{ fontSize: 74, fontWeight: 900, color: ORANGE, margin: 0, lineHeight: 1.0,
            fontFamily: 'system-ui, sans-serif' }}>
            {props.model}
          </h1>
          {props.trim && (
            <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)', fontFamily: 'system-ui, sans-serif', marginTop: 6 }}>
              {props.trim}
            </p>
          )}
        </div>

        <div style={{ opacity: badgeOpacity, transform: `translateX(${badgeX}px)` }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: 'system-ui, sans-serif' }}>
            {props.dealerName} &mdash; {props.dealerCity}, {props.dealerState}
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// Scene 2 (270-750 frames = 16s): Split gallery — big photo left, 2 stacked right, cycling
function Scene2({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 270

  // We show 4 photos in rotation: main photo changes every 4s (120 frames)
  const photos = [...props.photos.slice(0, 8)]
  while (photos.length < 6) photos.push(props.photos[0] || '')

  // Left photo cycles every 180 frames (6s)
  const leftIndex = Math.max(0, Math.min(Math.floor(localFrame / 180), 2))
  const leftPhoto = photos[leftIndex]

  // Right side shows 2 photos that change offset from left
  const rightIndex1 = (leftIndex + 1) % Math.min(photos.length, 6)
  const rightIndex2 = (leftIndex + 2) % Math.min(photos.length, 6)
  const rightPhoto1 = photos[rightIndex1]
  const rightPhoto2 = photos[rightIndex2]

  const specsOpacity = interpolate(localFrame, [15, 45], [0, 1], { extrapolateRight: 'clamp' })
  const specsY = interpolate(localFrame, [15, 45], [16, 0], { extrapolateRight: 'clamp' })

  const specs = [
    { label: 'Mileage', value: `${props.mileage.toLocaleString()} mi` },
    { label: 'Color', value: props.color || 'Contact dealer' },
    props.trim ? { label: 'Trim', value: props.trim } : { label: 'Year', value: String(props.year) },
    props.engine ? { label: 'Engine', value: props.engine } : { label: 'Make', value: props.make },
  ]

  return (
    <AbsoluteFill style={{ backgroundColor: CHARCOAL }}>
      {/* Left: large photo, 65% width */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '65%', height: '100%', overflow: 'hidden' }}>
        <KenBurns
          src={leftPhoto}
          startFrame={270 + leftIndex * 180}
          durationFrames={180}
          zoomDirection={leftIndex % 2 === 0 ? 'in' : 'out'}
        />
        {/* Thin right border between panels */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, backgroundColor: CHARCOAL }} />
      </div>

      {/* Right: two stacked photos, 35% width */}
      <div style={{
        position: 'absolute', right: 0, top: 0, width: '35%', height: '100%',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <KenBurns src={rightPhoto1} startFrame={270} durationFrames={480} zoomDirection="out" />
        </div>
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <KenBurns src={rightPhoto2} startFrame={270} durationFrames={480} zoomDirection="in" />
        </div>
      </div>

      {/* Overlay: specs panel on left side */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, width: '65%',
        background: 'linear-gradient(to top, rgba(17,24,39,0.92) 0%, transparent 60%)',
        padding: '0 40px 32px',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        height: '55%',
        opacity: specsOpacity,
        transform: `translateY(${specsY}px)`,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: ORANGE, letterSpacing: '0.15em',
          textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif', marginBottom: 12 }}>
          Vehicle Details
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          {specs.map((spec, i) => (
            <div key={i}>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
                letterSpacing: '0.1em', fontFamily: 'system-ui, sans-serif', marginBottom: 2 }}>
                {spec.label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
                {spec.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right side: vehicle name + photo count */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '35%',
        background: 'linear-gradient(to bottom, rgba(17,24,39,0.85) 0%, transparent 50%)',
        padding: '20px 20px',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif',
          textAlign: 'center', textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>
          {props.year} {props.make} {props.model}
        </p>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (750-1020 frames = 9s): Feature highlights
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 750

  const photo = props.photos[3] || props.photos[1] || props.photos[0] || ''
  const features = props.features?.length ? props.features.slice(0, 6) : ['Clean Carfax', 'Dealer Inspected', 'Ready to Drive']
  const titleOpacity = interpolate(localFrame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: CHARCOAL }}>
      {photo && <KenBurns src={photo} startFrame={750} durationFrames={270} zoomDirection="out" />}
      <AbsoluteFill style={{ background: 'rgba(17,24,39,0.58)' }} />
      <AbsoluteFill style={{ padding: '70px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ opacity: titleOpacity }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: AMBER, fontFamily: 'system-ui, sans-serif', marginBottom: 20 }}>
            Why This Vehicle
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 48px', maxWidth: 760 }}>
            {features.map((feat, i) => {
              const featOpacity = interpolate(localFrame, [15 + i * 12, 45 + i * 12], [0, 1], { extrapolateRight: 'clamp' })
              const featX = interpolate(localFrame, [15 + i * 12, 45 + i * 12], [-28, 0], { extrapolateRight: 'clamp' })
              return (
                <div key={i} style={{ opacity: featOpacity, transform: `translateX(${featX}px)`,
                  display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: AMBER, flexShrink: 0 }} />
                  <p style={{ fontSize: 21, color: WHITE, fontFamily: 'system-ui, sans-serif', fontWeight: 500 }}>
                    {feat}
                  </p>
                </div>
              )
            })}
          </div>
          {props.isSalvage && (
            <p style={{ marginTop: 28, fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'system-ui, sans-serif' }}>
              This vehicle carries a salvage title and is priced accordingly.
            </p>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// Scene 4 (1020-1200 frames = 6s): Price + CTA
function Scene4({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 1020
  const { fps } = useVideoConfig()

  const priceSpring = spring({ frame: Math.max(0, localFrame - 8), fps, config: { damping: 14, stiffness: 90 } })
  const priceScale = interpolate(priceSpring, [0, 1], [0.55, 1.0])
  const priceOpacity = interpolate(localFrame, [8, 30], [0, 1], { extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(localFrame, [32, 60], [0, 1], { extrapolateRight: 'clamp' })
  const ctaY = interpolate(localFrame, [32, 60], [20, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(145deg, ${CHARCOAL} 0%, #1f2937 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Amber accent */}
      <div style={{ width: 72, height: 4, backgroundColor: AMBER, borderRadius: 2, marginBottom: 28 }} />

      <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif', marginBottom: 6 }}>
        {props.year} {props.make} {props.model}
      </p>

      {props.showPrice && (
        <div style={{ opacity: priceOpacity, transform: `scale(${priceScale})`, marginBottom: 36 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: AMBER, fontFamily: 'system-ui, sans-serif', textAlign: 'center', marginBottom: 4 }}>
            Asking Price
          </p>
          <p style={{ fontSize: 84, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif',
            textAlign: 'center', lineHeight: 1 }}>
            {formatPrice(props.price)}
          </p>
        </div>
      )}

      <div style={{ opacity: ctaOpacity, transform: `translateY(${ctaY}px)`, textAlign: 'center' }}>
        {props.showPhone && (
          <div style={{
            backgroundColor: ORANGE, borderRadius: 14,
            paddingTop: 14, paddingBottom: 14, paddingLeft: 44, paddingRight: 44,
            display: 'inline-block', marginBottom: 12,
          }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
              {props.dealerPhone}
            </p>
          </div>
        )}
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif' }}>
          {props.dealerName}
          {props.dealerWebsite ? ` | ${props.dealerWebsite}` : ''}
        </p>
      </div>

      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 20, right: 28 }}>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Powered by DealerWyze
          </p>
        </div>
      )}
    </AbsoluteFill>
  )
}

export function VehicleSplitGallery(rawProps: Partial<VehicleVideoProps>) {
  const props: VehicleVideoProps = { ...DEFAULT_PROPS, ...rawProps }
  return (
    <AbsoluteFill style={{ backgroundColor: CHARCOAL, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sequence from={0} durationInFrames={270}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={270} durationInFrames={480}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={750} durationInFrames={270}>
        <Scene3 props={props} />
      </Sequence>
      <Sequence from={1020} durationInFrames={180}>
        <Scene4 props={props} />
      </Sequence>
      {props.narrationUrl && <Audio src={props.narrationUrl} />}
    </AbsoluteFill>
  )
}
