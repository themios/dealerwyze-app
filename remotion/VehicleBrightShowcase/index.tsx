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

// 16:9, 35 seconds @ 30fps = 1050 frames
export const TEMPLATE_DURATION = 1050

const WHITE  = '#ffffff'
const LIGHT  = '#f0f9ff'
const BLUE   = '#0ea5e9'
const DARK   = '#0f172a'
const GRAY   = '#f1f5f9'

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

// Full-bleed photo with vivid color treatment
function VividPhoto({
  src,
  startFrame,
  durationFrames,
  panDir = 'right',
}: {
  src: string
  startFrame: number
  durationFrames: number
  panDir?: 'left' | 'right' | 'up' | 'down'
}) {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame
  const progress = interpolate(localFrame, [0, durationFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(progress, [0, 1], [1.0, 1.12])
  const panX = panDir === 'right' ? interpolate(progress, [0, 1], [-3, 3])
    : panDir === 'left' ? interpolate(progress, [0, 1], [3, -3]) : 0
  const panY = panDir === 'up' ? interpolate(progress, [0, 1], [3, -3])
    : panDir === 'down' ? interpolate(progress, [0, 1], [-3, 3]) : 0

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
          transformOrigin: 'center center',
          // Vivid treatment: brighter, more saturated, punchier contrast
          filter: 'brightness(1.12) contrast(1.1) saturate(1.6)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-150 frames = 5s): Bright title card
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({ frame, fps, config: { damping: 18, stiffness: 100 } })
  const logoY = interpolate(logoSpring, [0, 1], [-40, 0])

  const titleOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateRight: 'clamp' })
  const titleY = interpolate(frame, [20, 50], [25, 0], { extrapolateRight: 'clamp' })

  const dividerWidth = interpolate(frame, [45, 80], [0, 80], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center' }}>

      {/* Blue top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: BLUE }} />

      {/* Dealer badge */}
      <div style={{ transform: `translateY(${logoY}px)`, marginBottom: 36, textAlign: 'center' }}>
        <div style={{
          backgroundColor: BLUE,
          borderRadius: 8,
          paddingTop: 8, paddingBottom: 8, paddingLeft: 24, paddingRight: 24,
          display: 'inline-block',
          marginBottom: 8,
        }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
            {props.dealerName}
          </p>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>
          {props.dealerCity}, {props.dealerState}
        </p>
      </div>

      {/* Animated divider */}
      <div style={{ width: dividerWidth, height: 3, backgroundColor: BLUE, borderRadius: 2, marginBottom: 28 }} />

      {/* Vehicle name */}
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#94a3b8', fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
          Now Available
        </p>
        <h1 style={{ fontSize: 80, fontWeight: 900, color: DARK, fontFamily: 'system-ui, sans-serif',
          lineHeight: 0.95, margin: 0 }}>
          {props.year} {props.make}
        </h1>
        <h1 style={{ fontSize: 80, fontWeight: 900, color: BLUE, fontFamily: 'system-ui, sans-serif',
          lineHeight: 0.95, margin: 0 }}>
          {props.model}
        </h1>
        {props.trim && (
          <p style={{ fontSize: 22, color: '#64748b', fontFamily: 'system-ui, sans-serif', marginTop: 10 }}>
            {props.trim}
          </p>
        )}
      </div>

      {/* Blue bottom accent */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: BLUE }} />
    </AbsoluteFill>
  )
}

// Scene 2 (150-750 frames = 20s): 5 vivid photos with white caption strips
const PHOTO_CAPTIONS = [
  (p: VehicleVideoProps) => `${p.mileage.toLocaleString()} Miles`,
  (p: VehicleVideoProps) => p.color ? p.color : `${p.year} ${p.make}`,
  (p: VehicleVideoProps) => p.trim || p.model,
  (p: VehicleVideoProps) => p.features[0] || 'Dealer Inspected',
  (p: VehicleVideoProps) => p.features[1] || 'Clean Carfax',
]

const PAN_DIRS: Array<'left' | 'right' | 'up' | 'down'> = ['right', 'left', 'up', 'right', 'left']

function Scene2({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 150

  const photos = [...props.photos.slice(0, 5)]
  while (photos.length < 5) photos.push(props.photos[0] || '')

  const photoIndex = Math.max(0, Math.min(Math.floor(localFrame / 120), 4))
  const photoLocalFrame = localFrame - photoIndex * 120
  const currentPhoto = photos[photoIndex]
  const caption = PHOTO_CAPTIONS[photoIndex](props)

  const captionOpacity = interpolate(photoLocalFrame, [8, 30], [0, 1], { extrapolateRight: 'clamp' })
  const captionY = interpolate(photoLocalFrame, [8, 30], [16, 0], { extrapolateRight: 'clamp' })

  const fadeIn = interpolate(photoLocalFrame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      <div style={{ opacity: fadeIn, position: 'absolute', inset: 0 }}>
        {currentPhoto && (
          <VividPhoto
            src={currentPhoto}
            startFrame={150 + photoIndex * 120}
            durationFrames={120}
            panDir={PAN_DIRS[photoIndex]}
          />
        )}
      </div>

      {/* Top bar: dealer name + photo counter */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, transparent 100%)',
        height: 80,
      }} />
      <div style={{ position: 'absolute', top: 18, left: 32, right: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: DARK, fontFamily: 'system-ui, sans-serif' }}>
          {props.year} {props.make} {props.model}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              width: 7, height: 7, borderRadius: '50%',
              backgroundColor: i === photoIndex ? BLUE : 'rgba(0,0,0,0.25)',
            }} />
          ))}
        </div>
      </div>

      {/* Bottom white caption strip */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, rgba(255,255,255,0.96) 60%, transparent 100%)',
        height: 120,
      }} />
      <div style={{
        position: 'absolute', bottom: 28, left: 40,
        opacity: captionOpacity,
        transform: `translateY(${captionY}px)`,
      }}>
        <div style={{
          backgroundColor: BLUE,
          borderRadius: 6,
          display: 'inline-block',
          paddingTop: 2, paddingBottom: 2, paddingLeft: 10, paddingRight: 10,
          marginBottom: 4,
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {`Photo ${photoIndex + 1} of 5`}
          </p>
        </div>
        <p style={{ fontSize: 26, fontWeight: 800, color: DARK, fontFamily: 'system-ui, sans-serif' }}>
          {caption}
        </p>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (750-1050 frames = 10s): Clean bright CTA
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 750
  const { fps } = useVideoConfig()

  const slideSpring = spring({ frame: Math.max(0, localFrame - 5), fps, config: { damping: 18, stiffness: 75 } })
  const slideY = interpolate(slideSpring, [0, 1], [40, 0])
  const opacity = interpolate(localFrame, [5, 40], [0, 1], { extrapolateRight: 'clamp' })

  const priceOpacity = interpolate(localFrame, [35, 65], [0, 1], { extrapolateRight: 'clamp' })
  const priceScale = interpolate(localFrame, [35, 65], [0.85, 1.0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center' }}>

      {/* Blue top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: BLUE }} />

      <div style={{
        opacity,
        transform: `translateY(${slideY}px)`,
        textAlign: 'center',
        maxWidth: 900,
        padding: '0 60px',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: BLUE, fontFamily: 'system-ui, sans-serif', marginBottom: 10 }}>
          {props.dealerName} - {props.dealerCity}, {props.dealerState}
        </p>

        <h2 style={{ fontSize: 56, fontWeight: 900, color: DARK, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.0, margin: '0 0 4px' }}>
          {props.year} {props.make} {props.model}
        </h2>
        {props.trim && (
          <p style={{ fontSize: 18, color: '#64748b', fontFamily: 'system-ui, sans-serif', marginBottom: 20 }}>
            {props.trim}
          </p>
        )}

        <div style={{ width: 56, height: 3, backgroundColor: BLUE, borderRadius: 2, margin: '0 auto 28px' }} />

        {props.showPrice && (
          <div style={{ opacity: priceOpacity, transform: `scale(${priceScale})`, marginBottom: 28 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#94a3b8', fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>
              Asking Price
            </p>
            <p style={{ fontSize: 76, fontWeight: 900, color: BLUE, fontFamily: 'system-ui, sans-serif', lineHeight: 1 }}>
              {formatPrice(props.price)}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {props.showPhone && (
            <div style={{
              backgroundColor: BLUE, borderRadius: 12,
              paddingTop: 14, paddingBottom: 14, paddingLeft: 48, paddingRight: 48,
              display: 'inline-block',
            }}>
              <p style={{ fontSize: 26, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
                {props.dealerPhone}
              </p>
            </div>
          )}
          {props.dealerWebsite && (
            <p style={{ fontSize: 14, color: '#94a3b8', fontFamily: 'system-ui, sans-serif', marginTop: 4 }}>
              {props.dealerWebsite}
            </p>
          )}
        </div>
      </div>

      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 20, right: 28 }}>
          <p style={{ fontSize: 10, color: '#cbd5e1', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Powered by DealerWyze
          </p>
        </div>
      )}

      {/* Blue bottom bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, backgroundColor: BLUE }} />
    </AbsoluteFill>
  )
}

export function VehicleBrightShowcase(rawProps: Partial<VehicleVideoProps>) {
  const props: VehicleVideoProps = { ...DEFAULT_PROPS, ...rawProps }
  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sequence from={0} durationInFrames={150}>
        <Scene1 props={props} />
      </Sequence>
      <Sequence from={150} durationInFrames={600}>
        <Scene2 props={props} />
      </Sequence>
      <Sequence from={750} durationInFrames={300}>
        <Scene3 props={props} />
      </Sequence>
      {props.narrationUrl && <Audio src={props.narrationUrl} />}
    </AbsoluteFill>
  )
}
