import React from 'react'
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Sequence,
  Img,
  Audio,
  staticFile,
} from 'remotion'
import { ContentReelProps, DEFAULT_CONTENT_PROPS } from './types'

// Duration constants (frames @ 30fps)
const COVER_FRAMES   = 90   // 3s
const SLIDE_FRAMES   = 120  // 4s each
const CTA_FRAMES     = 90   // 3s
export const MAX_SLIDES = 6

export function getContentReelDuration(slideCount: number): number {
  return COVER_FRAMES + Math.min(slideCount, MAX_SLIDES) * SLIDE_FRAMES + CTA_FRAMES
}

function easeIn(x: number) {
  return interpolate(x, [0, 1], [0, 1], { extrapolateRight: 'clamp' })
}

// ── Background with Ken Burns zoom ──────────────────────────────────────────

function KenBurnsBackground({
  imageUrl,
  totalFrames,
  bgColor,
}: {
  imageUrl?: string
  totalFrames: number
  bgColor: string
}) {
  const frame = useCurrentFrame()
  const progress = frame / totalFrames
  // Slow zoom from 1.0 to 1.08 over the slide duration
  const scale = interpolate(progress, [0, 1], [1.0, 1.08], { extrapolateRight: 'clamp' })

  if (!imageUrl) {
    return (
      <AbsoluteFill style={{ background: `linear-gradient(150deg, ${bgColor} 0%, #1e293b 60%, ${bgColor} 100%)` }} />
    )
  }

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
        <Img
          src={imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      {/* Dark overlay so text stays readable */}
      <AbsoluteFill style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />
    </AbsoluteFill>
  )
}

// ── Logo overlay (top-left) ──────────────────────────────────────────────────

function LogoOverlay({ logoUrl, accent }: { logoUrl?: string; accent: string }) {
  if (!logoUrl) return null
  return (
    <div style={{
      position: 'absolute',
      top: 36,
      left: 36,
      zIndex: 10,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 20,
      padding: '10px 16px',
      backdropFilter: 'blur(4px)',
    }}>
      <Img
        src={logoUrl}
        style={{ height: 156, width: 'auto', display: 'block' }}
      />
    </div>
  )
}

// ── Cover slide ──────────────────────────────────────────────────────────────

function CoverSlide({ props }: { props: ContentReelProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const badgeSpring = spring({ frame, fps, config: { damping: 16, stiffness: 100 } })
  const badgeY = interpolate(badgeSpring, [0, 1], [-50, 0])

  const headlineSpring = spring({ frame: Math.max(0, frame - 12), fps, config: { damping: 18, stiffness: 90 } })
  const headlineY = interpolate(headlineSpring, [0, 1], [40, 0])
  const headlineOpacity = interpolate(frame, [12, 35], [0, 1], { extrapolateRight: 'clamp' })

  const taglineOpacity = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: 'clamp' })

  const accent = props.accentColor
  const bgUrl = props.backgroundImageUrl

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <KenBurnsBackground imageUrl={bgUrl} totalFrames={COVER_FRAMES} bgColor={props.bgColor} />

      {/* Accent bar top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: accent }} />

      {/* Logo overlay */}
      <LogoOverlay logoUrl={props.logoUrl} accent={accent} />

      {/* Brand badge — top right (only if no logo) */}
      {!props.logoUrl && (
        <div style={{
          position: 'absolute', top: 48, right: 32,
          transform: `translateY(${badgeY}px)`,
        }}>
          <div style={{
            backgroundColor: accent,
            borderRadius: 12,
            paddingTop: 10, paddingBottom: 10, paddingLeft: 18, paddingRight: 18,
          }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#fff', textAlign: 'center', margin: 0 }}>
              {props.brandName}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 2, margin: 0 }}>
              {props.brandHandle}
            </p>
          </div>
        </div>
      )}

      {/* Main content — vertically centered */}
      <div style={{
        position: 'absolute', left: 48, right: 48,
        top: '50%', transform: 'translateY(-50%)',
      }}>
        {/* Accent line */}
        <div style={{ width: 56, height: 5, backgroundColor: accent, borderRadius: 3, marginBottom: 28 }} />

        {/* Topic headline */}
        <div style={{ opacity: headlineOpacity, transform: `translateY(${headlineY}px)` }}>
          <p style={{
            fontSize: 68,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1.05,
            margin: 0,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            {props.topic}
          </p>
        </div>

        {/* Tagline */}
        {props.tagline && (
          <p style={{
            fontSize: 26,
            fontWeight: 500,
            color: `${accent}cc`,
            opacity: taglineOpacity,
            margin: 0,
            marginTop: 20,
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
          }}>
            {props.tagline}
          </p>
        )}
      </div>

      {/* Slide count hint — bottom */}
      <div style={{ position: 'absolute', bottom: 48, left: 48 }}>
        <p style={{
          fontSize: 14, color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          {props.slides.length} things to know  →
        </p>
      </div>
    </AbsoluteFill>
  )
}

// ── Content slide ────────────────────────────────────────────────────────────

function ContentSlide({
  slide,
  index,
  total,
  accent,
  bgColor,
  defaultBgImage,
  logoUrl,
}: {
  slide: ContentReelProps['slides'][number]
  index: number
  total: number
  accent: string
  bgColor: string
  defaultBgImage?: string
  logoUrl?: string
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const slideSpring = spring({ frame, fps, config: { damping: 20, stiffness: 100 } })
  const slideX = interpolate(slideSpring, [0, 1], [80, 0])
  const slideOpacity = easeIn(interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }))

  const bodyOpacity = interpolate(frame, [18, 40], [0, 1], { extrapolateRight: 'clamp' })

  const num = String(index + 1).padStart(2, '0')
  const bgUrl = slide.backgroundImageUrl ?? defaultBgImage

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <KenBurnsBackground imageUrl={bgUrl} totalFrames={SLIDE_FRAMES} bgColor={bgColor} />

      {/* Top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: accent }} />

      {/* Logo overlay */}
      <LogoOverlay logoUrl={logoUrl} accent={accent} />

      {/* Progress dots */}
      <div style={{
        position: 'absolute', top: 44, right: 36,
        display: 'flex', gap: 8,
      }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: i === index ? 20 : 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: i === index ? accent : 'rgba(255,255,255,0.3)',
          }} />
        ))}
      </div>

      {/* Main content */}
      <div style={{
        position: 'absolute', left: 48, right: 48,
        top: '50%',
        opacity: slideOpacity,
        transform: `translateX(${slideX}px) translateY(-50%)`,
      }}>
        {/* Slide number */}
        <p style={{
          fontSize: 80,
          fontWeight: 900,
          color: accent,
          opacity: 0.25,
          lineHeight: 1,
          margin: 0,
          marginBottom: -16,
          textShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {num}
        </p>

        {/* Emoji */}
        {slide.emoji && (
          <p style={{ fontSize: 56, margin: 0, marginBottom: 12 }}>{slide.emoji}</p>
        )}

        {/* Headline */}
        <p style={{
          fontSize: 60,
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1.1,
          margin: 0,
          letterSpacing: '-0.02em',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          {slide.headline}
        </p>

        {/* Body */}
        {slide.body && (
          <p style={{
            fontSize: 72,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            lineHeight: 1.35,
            marginTop: 28,
            opacity: bodyOpacity,
            textShadow: '0 2px 10px rgba(0,0,0,0.7)',
          }}>
            {slide.body}
          </p>
        )}
      </div>

      {/* Accent line bottom-left */}
      <div style={{
        position: 'absolute', bottom: 56, left: 48,
        width: 40, height: 4, backgroundColor: accent, borderRadius: 2, opacity: 0.6,
      }} />
    </AbsoluteFill>
  )
}

// ── CTA close slide ──────────────────────────────────────────────────────────

function CTASlide({ props }: { props: ContentReelProps }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({ frame, fps, config: { damping: 14, stiffness: 80 } })
  const logoScale  = interpolate(logoSpring, [0, 1], [0.6, 1])

  const ctaOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateRight: 'clamp' })
  const ctaY       = interpolate(frame, [25, 50], [20, 0], { extrapolateRight: 'clamp' })

  const imagesOpacity = interpolate(frame, [35, 60], [0, 1], { extrapolateRight: 'clamp' })

  const accent = props.accentColor
  const hasCtaImages = props.ctaImages && props.ctaImages.length > 0

  return (
    <AbsoluteFill style={{
      background: `linear-gradient(160deg, ${props.bgColor} 0%, #1e293b 50%, #0c1524 100%)`,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: accent }} />

      {/* Logo overlay */}
      <LogoOverlay logoUrl={props.logoUrl} accent={accent} />

      {/* Brand logo block or image-based CTA */}
      {hasCtaImages ? (
        // Image-based CTA: show brand logo image + ctaImages side by side
        <>
          {/* Brand name + handle */}
          <div style={{ transform: `scale(${logoScale})`, textAlign: 'center', marginBottom: 32 }}>
            {props.logoUrl ? (
              <Img src={props.logoUrl} style={{ height: 80, width: 'auto', margin: '0 auto 16px' }} />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 20,
                backgroundColor: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                <p style={{ fontSize: 34, fontWeight: 900, color: '#fff', margin: 0 }}>
                  {props.brandName.charAt(0)}
                </p>
              </div>
            )}
            <p style={{ fontSize: 38, fontWeight: 900, color: '#fff', margin: 0 }}>
              {props.brandName}
            </p>
            <p style={{ fontSize: 20, color: accent, marginTop: 4, margin: 0 }}>
              {props.brandHandle}
            </p>
          </div>

          {/* Business card + QR images */}
          <div style={{
            opacity: imagesOpacity,
            display: 'flex',
            flexDirection: 'row',
            gap: 20,
            paddingLeft: 40,
            paddingRight: 40,
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
          }}>
            {/* Business card — larger */}
            {props.ctaImages![0] && (
              <div style={{
                flex: 2,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                border: `2px solid rgba(255,255,255,0.1)`,
              }}>
                <Img
                  src={props.ctaImages![0]}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            )}

            {/* QR — square */}
            {props.ctaImages![1] && (
              <div style={{
                flex: 1,
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                backgroundColor: '#fff',
                padding: 8,
              }}>
                <Img
                  src={props.ctaImages![1]}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            )}
          </div>

          {/* CTA text */}
          <div style={{
            marginTop: 28,
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            textAlign: 'center',
            paddingLeft: 48,
            paddingRight: 48,
          }}>
            <p style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.8)', margin: 0, lineHeight: 1.4 }}>
              {props.ctaText}
            </p>
          </div>
        </>
      ) : (
        // Text-only CTA (no ctaImages provided)
        <>
          <div style={{ transform: `scale(${logoScale})`, textAlign: 'center' }}>
            {props.logoUrl ? (
              <Img src={props.logoUrl} style={{ height: 120, width: 'auto', margin: '0 auto 24px', display: 'block' }} />
            ) : (
              <div style={{
                width: 96, height: 96, borderRadius: 24,
                backgroundColor: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <p style={{ fontSize: 40, fontWeight: 900, color: '#fff', margin: 0 }}>
                  {props.brandName.charAt(0)}
                </p>
              </div>
            )}
            <p style={{ fontSize: 44, fontWeight: 900, color: '#fff', margin: 0 }}>
              {props.brandName}
            </p>
            <p style={{ fontSize: 22, color: accent, marginTop: 6, marginBottom: 0 }}>
              {props.brandHandle}
            </p>
            {props.website && (
              <p style={{ fontSize: 26, color: 'rgba(255,255,255,0.7)', marginTop: 10, marginBottom: 0 }}>
                {props.website}
              </p>
            )}
          </div>

          <div style={{
            marginTop: 48,
            opacity: ctaOpacity,
            transform: `translateY(${ctaY}px)`,
            textAlign: 'center',
            paddingLeft: 48,
            paddingRight: 48,
          }}>
            <div style={{
              border: `2px solid ${accent}`,
              borderRadius: 16,
              paddingTop: 20, paddingBottom: 20, paddingLeft: 36, paddingRight: 36,
            }}>
              <p style={{ fontSize: 30, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.4 }}>
                {props.ctaText}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Watermark */}
      {props.watermark && (
        <p style={{
          position: 'absolute', bottom: 20, right: 24,
          fontSize: 11, color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          DealerWyze
        </p>
      )}
    </AbsoluteFill>
  )
}

// ── Main composition ─────────────────────────────────────────────────────────

export function ContentReel(rawProps: Partial<ContentReelProps>) {
  const props: ContentReelProps = { ...DEFAULT_CONTENT_PROPS, ...rawProps }
  const slides = props.slides.slice(0, MAX_SLIDES)

  return (
    <AbsoluteFill>
      {/* Audio narration — plays across the full composition */}
      {props.narrationUrl && (
        <Audio src={props.narrationUrl} />
      )}

      {/* Cover */}
      <Sequence from={0} durationInFrames={COVER_FRAMES}>
        <CoverSlide props={props} />
      </Sequence>

      {/* Content slides */}
      {slides.map((slide, i) => {
        const from = COVER_FRAMES + i * SLIDE_FRAMES
        return (
          <Sequence key={i} from={from} durationInFrames={SLIDE_FRAMES}>
            <ContentSlide
              slide={slide}
              index={i}
              total={slides.length}
              accent={props.accentColor}
              bgColor={props.bgColor}
              defaultBgImage={props.backgroundImageUrl}
              logoUrl={props.logoUrl}
            />
          </Sequence>
        )
      })}

      {/* CTA */}
      <Sequence from={COVER_FRAMES + slides.length * SLIDE_FRAMES}>
        <CTASlide props={props} />
      </Sequence>
    </AbsoluteFill>
  )
}
