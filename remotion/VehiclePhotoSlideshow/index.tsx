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
const DARK   = '#0f172a'
const ORANGE = '#f97316'
const GRAY   = '#f8f7f5'

function formatPrice(p: number) {
  return `$${p.toLocaleString()}`
}

// Ken Burns photo
function KenBurnsPhoto({
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
  const scale = interpolate(progress, [0, 1], [1.0, 1.1])
  const panX = panDir === 'right' ? interpolate(progress, [0, 1], [-2, 2])
    : panDir === 'left' ? interpolate(progress, [0, 1], [2, -2]) : 0
  const panY = panDir === 'up' ? interpolate(progress, [0, 1], [2, -2])
    : panDir === 'down' ? interpolate(progress, [0, 1], [-2, 2]) : 0

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
          filter: 'brightness(1.08) contrast(1.05) saturate(1.3)',
        }}
      />
    </AbsoluteFill>
  )
}

// Scene 1 (0-150 frames = 5s): Title card with vehicle name and dealer branding
function Scene1({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({ frame, fps, config: { damping: 18, stiffness: 90 } })
  const logoY = interpolate(logoSpring, [0, 1], [-30, 0])
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' })

  const titleSpring = spring({ frame: Math.max(0, frame - 15), fps, config: { damping: 16, stiffness: 80 } })
  const titleY = interpolate(titleSpring, [0, 1], [30, 0])
  const titleOpacity = interpolate(frame, [15, 45], [0, 1], { extrapolateRight: 'clamp' })

  const dividerOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: WHITE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* Top dealer badge */}
      <div style={{ opacity: logoOpacity, transform: `translateY(${logoY}px)`, marginBottom: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 6 }}>
          {props.dealerName}
        </p>
        <p style={{ fontSize: 13, color: '#6b7280', fontFamily: 'system-ui, sans-serif' }}>
          {props.dealerCity}, {props.dealerState}
        </p>
      </div>

      {/* Divider */}
      <div style={{
        opacity: dividerOpacity,
        width: 60, height: 3,
        backgroundColor: ORANGE,
        borderRadius: 2,
        marginBottom: 32,
      }} />

      {/* Vehicle title */}
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#9ca3af', fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
          Now Available
        </p>
        <h1 style={{ fontSize: 72, fontWeight: 900, color: DARK, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.0, margin: 0 }}>
          {props.year} {props.make}
        </h1>
        <h1 style={{ fontSize: 72, fontWeight: 900, color: ORANGE, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.0, margin: 0 }}>
          {props.model}
        </h1>
        {props.trim && (
          <p style={{ fontSize: 20, color: '#6b7280', fontFamily: 'system-ui, sans-serif', marginTop: 8 }}>
            {props.trim}
          </p>
        )}
      </div>
    </AbsoluteFill>
  )
}

// Scene 2 (150-750 frames = 20s): 5 photos, 4s each (120 frames each) with text overlays
const PHOTO_CAPTIONS = [
  (p: VehicleVideoProps) => `${p.mileage.toLocaleString()} miles`,
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

  const captionOpacity = interpolate(photoLocalFrame, [10, 35], [0, 1], { extrapolateRight: 'clamp' })
  const captionX = interpolate(photoLocalFrame, [10, 35], [20, 0], { extrapolateRight: 'clamp' })

  const fadeOpacity = interpolate(photoLocalFrame, [0, 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: DARK }}>
      <div style={{ opacity: fadeOpacity, position: 'absolute', inset: 0 }}>
        {currentPhoto && (
          <KenBurnsPhoto
            src={currentPhoto}
            startFrame={150 + photoIndex * 120}
            durationFrames={120}
            panDir={PAN_DIRS[photoIndex]}
          />
        )}
      </div>

      {/* Light vignette bottom */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.50) 0%, transparent 45%)',
      }} />

      {/* Caption bar */}
      <div style={{
        position: 'absolute', bottom: 40, left: 60, right: 60,
        opacity: captionOpacity,
        transform: `translateX(${captionX}px)`,
      }}>
        <div style={{
          backgroundColor: WHITE,
          borderRadius: 10,
          display: 'inline-block',
          paddingTop: 8, paddingBottom: 8, paddingLeft: 16, paddingRight: 16,
        }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: DARK, fontFamily: 'system-ui, sans-serif' }}>
            {caption}
          </p>
        </div>
      </div>

      {/* Photo counter */}
      <div style={{ position: 'absolute', top: 28, right: 32, display: 'flex', gap: 6 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            backgroundColor: i === photoIndex ? WHITE : 'rgba(255,255,255,0.3)',
          }} />
        ))}
      </div>

      {/* Vehicle label top-left */}
      <div style={{ position: 'absolute', top: 24, left: 32 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {props.year} {props.make} {props.model}
        </p>
      </div>
    </AbsoluteFill>
  )
}

// Scene 3 (750-1050 frames = 10s): Final CTA with price, phone, website
function Scene3({ props }: { props: VehicleVideoProps }) {
  const frame = useCurrentFrame()
  const localFrame = frame - 750
  const { fps } = useVideoConfig()

  const containerSpring = spring({ frame: Math.max(0, localFrame - 5), fps, config: { damping: 18, stiffness: 75 } })
  const containerY = interpolate(containerSpring, [0, 1], [40, 0])
  const containerOpacity = interpolate(localFrame, [5, 40], [0, 1], { extrapolateRight: 'clamp' })

  const priceOpacity = interpolate(localFrame, [30, 60], [0, 1], { extrapolateRight: 'clamp' })
  const priceScale = interpolate(localFrame, [30, 60], [0.85, 1.0], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ backgroundColor: GRAY, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center' }}>

      <div style={{
        opacity: containerOpacity,
        transform: `translateY(${containerY}px)`,
        textAlign: 'center',
        maxWidth: 900,
        padding: '0 60px',
      }}>
        {/* Dealer */}
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: ORANGE, fontFamily: 'system-ui, sans-serif', marginBottom: 12 }}>
          {props.dealerName} - {props.dealerCity}, {props.dealerState}
        </p>

        {/* Vehicle */}
        <h2 style={{ fontSize: 52, fontWeight: 900, color: DARK, fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.05, margin: '0 0 6px' }}>
          {props.year} {props.make} {props.model}
        </h2>
        {props.trim && (
          <p style={{ fontSize: 18, color: '#6b7280', fontFamily: 'system-ui, sans-serif', marginBottom: 24 }}>
            {props.trim}
          </p>
        )}

        {/* Divider */}
        <div style={{ width: 48, height: 3, backgroundColor: ORANGE, borderRadius: 2,
          margin: '0 auto 32px' }} />

        {/* Price */}
        {props.showPrice && (
          <div style={{ opacity: priceOpacity, transform: `scale(${priceScale})`, marginBottom: 32 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: '#9ca3af', fontFamily: 'system-ui, sans-serif', marginBottom: 4 }}>
              Asking Price
            </p>
            <p style={{ fontSize: 72, fontWeight: 900, color: DARK, fontFamily: 'system-ui, sans-serif',
              lineHeight: 1 }}>
              {formatPrice(props.price)}
            </p>
          </div>
        )}

        {/* Contact */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {props.showPhone && (
            <div style={{
              backgroundColor: DARK,
              borderRadius: 12,
              paddingTop: 14, paddingBottom: 14, paddingLeft: 40, paddingRight: 40,
              display: 'inline-block',
            }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: WHITE, fontFamily: 'system-ui, sans-serif' }}>
                {props.dealerPhone}
              </p>
            </div>
          )}
          {props.dealerWebsite && (
            <p style={{ fontSize: 14, color: '#6b7280', fontFamily: 'system-ui, sans-serif', marginTop: 4 }}>
              {props.dealerWebsite}
            </p>
          )}
        </div>
      </div>

      {props.showWatermark && (
        <div style={{ position: 'absolute', bottom: 20, right: 28 }}>
          <p style={{ fontSize: 10, color: '#d1cdc8', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Powered by DealerWyze
          </p>
        </div>
      )}
    </AbsoluteFill>
  )
}

// Main composition
export function VehiclePhotoSlideshow(rawProps: Partial<VehicleVideoProps>) {
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
