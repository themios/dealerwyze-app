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
const DARK   = '#0d1b3e'
const ORANGE = '#f97316'
const WHITE  = '#ffffff'

function formatPhone(p: string) {
  return p
}

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

// Ken Burns animated photo
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
    ? interpolate(progress, [0, 1], [1.0, 1.12])
    : interpolate(progress, [0, 1], [1.12, 1.0])
  const translateX = interpolate(progress, [0, 1], [0, zoomDirection === 'in' ? -2 : 2])

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translateX(${translateX}%)`,
          transformOrigin: 'center center',
          filter: 'brightness(1.08) contrast(1.05) saturate(1.3)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-300 frames = 10s): Hero photo + dealer name slide in
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const dealerSlide = spring({ frame, fps, config: { damping: 18, stiffness: 80 } })
  const dealerX = interpolate(dealerSlide, [0, 1], [-60, 0])
  const dealerOpacity = interpolate(frame, [5, 25], [0, 1], { extrapolateRight: 'clamp' })

  const titleSlide = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 18, stiffness: 70 } })
  const titleX = interpolate(titleSlide, [0, 1], [-80, 0])
  const titleOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateRight: 'clamp' })

  const photo = props.photos[0] || ''

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {photo && <KenBurns src={photo} startFrame={0} durationFrames={300} zoomDirection="in" />}
      {/* Dark gradient overlay */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to right, rgba(13,27,62,0.55) 0%, rgba(13,27,62,0.22) 60%, rgba(13,27,62,0.0) 100%)',
        }}
      />
      {/* Content */}
      <AbsoluteFill style={{ padding: '60px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ opacity: dealerOpacity, transform: `translateX(${dealerX}px)`, marginBottom: 8 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: ORANGE,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {props.dealerName} - {props.dealerCity}, {props.dealerState}
          </span>
        </div>
        <div style={{ opacity: titleOpacity, transform: `translateX(${titleX}px)` }}>
          <h1 style={{
            fontSize: 68,
            fontWeight: 900,
            color: WHITE,
            margin: 0,
            lineHeight: 1.05,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {props.year} {props.make}
          </h1>
          <h1 style={{
            fontSize: 68,
            fontWeight: 900,
            color: ORANGE,
            margin: 0,
            lineHeight: 1.05,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {props.model}
          </h1>
          {props.trim && (
            <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.65)', margin: '6px 0 0', fontFamily: 'system-ui, sans-serif' }}>
              {props.trim}
            </p>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// Scene 2 (300-750 frames = 15s): 4-photo gallery with specs overlay
function Scene2({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 300

  const photos = props.photos.slice(0, 4)
  while (photos.length < 4) photos.push(photos[0] || '')

  const specsOpacity = interpolate(localFrame, [20, 50], [0, 1], { extrapolateRight: 'clamp' })
  const specsY = interpolate(localFrame, [20, 50], [20, 0], { extrapolateRight: 'clamp' })

  const specs = [
    { label: 'Mileage', value: `${props.mileage.toLocaleString()} mi` },
    { label: 'Color', value: props.color || 'Contact dealer' },
    props.trim ? { label: 'Trim', value: props.trim } : { label: 'Year', value: String(props.year) },
    props.engine ? { label: 'Engine', value: props.engine } : { label: 'Make', value: props.make },
  ]

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {/* 2x2 photo grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        width: '60%',
        height: '100%',
        gap: 3,
        overflow: 'hidden',
      }}>
        {photos.map((src, i) => (
          <div key={i} style={{ overflow: 'hidden', position: 'relative' }}>
            <KenBurns
              src={src}
              startFrame={300 + i * 30}
              durationFrames={450}
              zoomDirection={i % 2 === 0 ? 'in' : 'out'}
            />
          </div>
        ))}
      </div>

      {/* Right side specs panel */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: '40%',
        height: '100%',
        background: `linear-gradient(to bottom, ${DARK}, #1e293b)`,
        padding: '50px 50px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 24,
      }}>
        <div style={{ opacity: specsOpacity, transform: `translateY(${specsY}px)` }}>
          <p style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 18,
          }}>
            Vehicle Details
          </p>
          {specs.map((spec, i) => (
            <div key={i} style={{ marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase',
                letterSpacing: '0.12em', fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>
                {spec.label}
              </p>
              <p style={{ fontSize: 22, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
                {spec.value}
              </p>
            </div>
          ))}
        </div>
        {/* Vehicle name reminder */}
        <div style={{ marginTop: 'auto' }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontFamily: 'system-ui, sans-serif' }}>
            {props.year} {props.make} {props.model}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (750-1050 frames = 10s): Feature highlights
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 750

  const photo = props.photos[2] || props.photos[0] || ''

  const defaultFeatures = ['Clean Carfax', 'Dealer Inspected', 'Ready to Drive']
  const features = props.features?.length ? props.features.slice(0, 4) : defaultFeatures

  const titleOpacity = interpolate(localFrame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      {photo && <KenBurns src={photo} startFrame={750} durationFrames={300} zoomDirection="out" />}
      <AbsoluteFill style={{ background: 'rgba(13,27,62,0.45)' }} />
      <AbsoluteFill style={{ padding: '70px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ opacity: titleOpacity }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
            color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 24 }}>
            Why This Vehicle
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 40px', maxWidth: 700 }}>
            {features.map((feat, i) => {
              const featOpacity = interpolate(localFrame, [20 + i * 12, 50 + i * 12], [0, 1], { extrapolateRight: 'clamp' })
              const featX = interpolate(localFrame, [20 + i * 12, 50 + i * 12], [-30, 0], { extrapolateRight: 'clamp' })
              return (
                <div key={i} style={{ opacity: featOpacity, transform: `translateX(${featX}px)`, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: ORANGE, flexShrink: 0,
                  }} />
                  <p style={{ fontSize: 20, color: WHITE, fontFamily: 'system-ui, sans-serif', fontWeight: 500 }}>
                    {feat}
                  </p>
                </div>
              )
            })}
          </div>
          {props.isSalvage && (
            <p style={{ marginTop: 28, fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif' }}>
              This vehicle carries a salvage title and is priced accordingly.
            </p>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// Scene 4 (1050-1200 frames = 5s): Price reveal + dealer CTA
function Scene4({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 1050
  const { fps } = useVideoConfig()

  const priceSpring = spring({ frame: Math.max(0, localFrame - 10), fps, config: { damping: 15, stiffness: 90 } })
  const priceScale = interpolate(priceSpring, [0, 1], [0.6, 1])
  const priceOpacity = interpolate(localFrame, [10, 35], [0, 1], { extrapolateRight: 'clamp' })

  const ctaOpacity = interpolate(localFrame, [35, 60], [0, 1], { extrapolateRight: 'clamp' })
  const ctaY = interpolate(localFrame, [35, 60], [20, 0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${DARK} 0%, #1e293b 100%)`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
    }}>
      {/* Orange accent bar */}
      <div style={{ width: 80, height: 4, backgroundColor: ORANGE, borderRadius: 2, marginBottom: 32 }} />

      {/* Vehicle name */}
      <p style={{ fontSize: 22, color: 'rgba(255,255,255,0.6)', fontFamily: 'system-ui, sans-serif', marginBottom: 8 }}>
        {props.year} {props.make} {props.model}
      </p>

      {/* Price reveal */}
      {props.showPrice && (
        <div style={{ opacity: priceOpacity, transform: `scale(${priceScale})`, marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: ORANGE, fontFamily: 'system-ui, sans-serif', textAlign: 'center', marginBottom: 4 }}>
            Priced At
          </p>
          <p style={{ fontSize: 80, fontWeight: 900, color: WHITE, fontFamily: 'system-ui, sans-serif',
            textAlign: 'center', lineHeight: 1 }}>
            {formatPrice(props.price)}
          </p>
        </div>
      )}

      {/* CTA */}
      <div style={{ opacity: ctaOpacity, transform: `translateY(${ctaY}px)`, textAlign: 'center' }}>
        {props.showPhone && (
          <p style={{ fontSize: 28, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif', marginBottom: 8 }}>
            Call or text {formatPhone(props.dealerPhone)}
          </p>
        )}
        {props.dealerWebsite && (
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif' }}>
            {props.dealerWebsite}
          </p>
        )}
      </div>

      {/* Watermark */}
      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 24, right: 32 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Powered by DealerWyze
          </p>
        </div>
      )}
    </AbsoluteFill>
  )
}

// Main composition component
export function VehicleModernDark(rawProps: Partial<VehicleVideoProps>) {
  const props: VehicleVideoProps = { ...DEFAULT_PROPS, ...rawProps }
  return (
    <AbsoluteFill style={{ backgroundColor: DARK, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sequence from={0} durationInFrames={300}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={300} durationInFrames={450}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={750} durationInFrames={300}>
        <Scene3 props={props} />
      </Sequence>
      <Sequence from={1050} durationInFrames={150}>
        <Scene4 props={props} />
      </Sequence>

      {/* Narration audio */}
      {props.narrationUrl && (
        <Audio src={props.narrationUrl} />
      )}
    </AbsoluteFill>
  )
}
