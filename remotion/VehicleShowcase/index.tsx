import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';
import { fadeIn, Particles, SLATE, WHITE } from '../components/shared';

// ── Data ──────────────────────────────────────────────────────────────────────

const VEHICLE = {
  year: 2024,
  make: 'Honda',
  model: 'HR-V',
  trim: 'Sport FWD',
  price: 17995,
  mileage: 19000,
  color: 'Teal',
  interior: 'Charcoal',
  vin: '3CZRZ1H57RM729426',
  engine: '2.0L i-4',
  transmission: 'CVT',
  mpgCity: 26,
  mpgHwy: 32,
  isSalvage: true,
  features: ['Apple CarPlay', 'Android Auto', 'Remote Start', 'Adaptive Cruise Control', 'Auto Climate Control'],
  sellingPoints: [
    { icon: '📍', headline: 'Low Mileage', detail: 'Under 20,000 miles — almost-new feel with plenty of life left.' },
    { icon: '⛽', headline: 'Fuel Efficient', detail: '26 city / 32 hwy MPG — great for commuting and road trips.' },
    { icon: '🏆', headline: 'Sport Trim', detail: 'Upgraded styling, sharper handling, sporty touches that set it apart.' },
    { icon: '🔒', headline: 'Honda Reliability', detail: 'Roomy interior, modern tech, and Honda\'s reputation for durability.' },
  ],
  avgMarketPrice: 24000,
  avgMarketMiles: 25000,
  photos: [
    'https://static.cargurus.com/images/forsale/2025/12/12/17/39/2024_honda_hr-v-pic-7699332617293369480-1024x768.jpeg',
    'https://static.cargurus.com/images/forsale/2025/12/11/09/53/2024_honda_hr-v-pic-5016420412295263710-1024x768.jpeg',
    'https://static.cargurus.com/images/forsale/2025/12/13/10/47/2024_honda_hr-v-pic-1771503061041778266-1024x768.jpeg',
    'https://static.cargurus.com/images/forsale/2025/12/11/09/53/2024_honda_hr-v-pic-1775006326275237013-1024x768.jpeg',
    'https://static.cargurus.com/images/forsale/2025/12/11/09/53/2024_honda_hr-v-pic-79177339632317063-1024x768.jpeg',
    'https://static.cargurus.com/images/forsale/2025/12/11/09/53/2024_honda_hr-v-pic-2496315886435849706-1024x768.jpeg',
  ],
};

const DEALER = {
  name: 'Apollo Auto',
  city: 'El Monte',
  state: 'CA',
  address: '10915 Garvey Ave., El Monte, CA 91733',
  phone: '(626) 215-0440',
  phoneSimi: '(805) 404-3873',
  website: 'ApolloAuto.US',
  taglines: ['Transparent Pricing', 'No Dealer Add-ons', 'Easy Financing', 'Trade-Ins Welcome'],
};

const TEAL        = '#0d9488';
const TEAL_LIGHT  = '#5eead4';
const AMBER       = '#f59e0b';
const RED_SOFT    = '#fca5a5';

// ── Helpers ───────────────────────────────────────────────────────────────────

const KenBurnsPhoto: React.FC<{
  src: string; startFrame: number; duration: number;
  direction?: 'left' | 'right' | 'up';
}> = ({ src, startFrame, duration, direction = 'right' }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [startFrame, startFrame + duration], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });
  const scale = 1 + t * 0.08;
  const xShift = direction === 'left' ? -t * 3 : direction === 'right' ? t * 3 : 0;
  const yShift = direction === 'up' ? -t * 2 : 0;
  const op = interpolate(
    frame,
    [startFrame, startFrame + 20, startFrame + duration - 20, startFrame + duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: op, overflow: 'hidden' }}>
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translate(${xShift}%, ${yShift}%)` }} />
    </div>
  );
};

const SalvageBadge: React.FC<{ startFrame?: number }> = ({ startFrame = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{
      opacity: fadeIn(frame, startFrame, 15),
      display: 'inline-flex', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(245,158,11,0.2)',
      border: `2px solid ${AMBER}`,
      borderRadius: 8,
      padding: '6px 16px',
      color: AMBER,
      fontSize: 15,
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: 2,
    }}>
      ⚠ Salvage Title — Priced Accordingly
    </div>
  );
};

const ProgressBarInner: React.FC<{ totalFrames: number; color?: string }> = ({ totalFrames, color = TEAL }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.08)' }}>
      <div style={{ height: '100%', width: `${(frame / totalFrames) * 100}%`, backgroundColor: color }} />
    </div>
  );
};

// ── Scene 1: Hero ─────────────────────────────────────────────────────────────

const SceneHero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(frame, [20, 50], [60, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.4)),
  });
  const subtitleY = interpolate(frame, [35, 60], [40, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const lineW = spring({ frame: frame - 50, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill>
      <KenBurnsPhoto src={VEHICLE.photos[0]} startFrame={0} duration={270} direction="right" />
      <AbsoluteFill style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.88) 48%, rgba(0,0,0,0.05) 100%)' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: TEAL }} />

      <AbsoluteFill style={{ padding: '52px 80px', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        {/* Dealer + salvage badge row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18 }}>
          <div style={{ opacity: fadeIn(frame, 8, 20), color: TEAL_LIGHT, fontSize: 17, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 4 }}>
            {DEALER.name} — {DEALER.city}, {DEALER.state}
          </div>
          <SalvageBadge startFrame={18} />
        </div>

        {/* Year + Make */}
        <div style={{ transform: `translateY(${titleY}px)`, opacity: fadeIn(frame, 20, 20), color: WHITE, fontSize: 70, fontWeight: 900, lineHeight: 1, marginBottom: 6 }}>
          {VEHICLE.year} {VEHICLE.make}
        </div>

        {/* Model + Trim */}
        <div style={{ transform: `translateY(${subtitleY}px)`, opacity: fadeIn(frame, 35, 20), color: TEAL_LIGHT, fontSize: 50, fontWeight: 700, marginBottom: 24 }}>
          {VEHICLE.model} {VEHICLE.trim}
        </div>

        {/* Divider */}
        <div style={{ width: `${lineW * 200}px`, height: 3, backgroundColor: TEAL, marginBottom: 24, borderRadius: 2 }} />

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 36, opacity: fadeIn(frame, 65, 20) }}>
          {[
            { label: 'Miles', value: `${VEHICLE.mileage.toLocaleString()}` },
            { label: 'Engine', value: `${VEHICLE.engine} CVT` },
            { label: 'MPG', value: `${VEHICLE.mpgCity} city / ${VEHICLE.mpgHwy} hwy` },
            { label: 'Color', value: `${VEHICLE.color} / ${VEHICLE.interior}` },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ color: TEAL_LIGHT, fontSize: 12, textTransform: 'uppercase', letterSpacing: 2 }}>{s.label}</div>
              <div style={{ color: WHITE, fontSize: 20, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Scene 2: Gallery + features ───────────────────────────────────────────────

const FRAMES_PER_PHOTO = 90;

const SceneGallery: React.FC = () => {
  const frame = useCurrentFrame();
  const galleryPhotos = VEHICLE.photos.slice(1);
  const dirs: Array<'left' | 'right' | 'up'> = ['left', 'right', 'up', 'left', 'right'];

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      {galleryPhotos.map((src, i) => (
        <KenBurnsPhoto key={i} src={src} startFrame={i * FRAMES_PER_PHOTO} duration={FRAMES_PER_PHOTO + 20} direction={dirs[i % dirs.length]} />
      ))}

      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 28%, transparent 60%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 10%, transparent 32%)' }} />

      {/* Dot progress */}
      <div style={{ position: 'absolute', top: 24, right: 36, display: 'flex', gap: 8, alignItems: 'center' }}>
        {galleryPhotos.map((_, i) => {
          const cur = Math.floor(frame / FRAMES_PER_PHOTO);
          return (
            <div key={i} style={{ width: cur === i ? 24 : 8, height: 4, borderRadius: 2, backgroundColor: cur === i ? TEAL : 'rgba(255,255,255,0.3)' }} />
          );
        })}
      </div>

      {/* Feature tags */}
      <div style={{ position: 'absolute', bottom: 36, left: 56, right: 56 }}>
        <div style={{ opacity: fadeIn(frame, 40, 20), color: TEAL_LIGHT, fontSize: 13, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 14 }}>
          Key Features
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {VEHICLE.features.map((f, i) => {
            const sc = spring({ frame: frame - (50 + i * 12), fps: 30, config: { damping: 14 } });
            return (
              <div key={i} style={{
                transform: `scale(${sc})`,
                backgroundColor: 'rgba(13,148,136,0.18)',
                border: `1.5px solid ${TEAL}`,
                borderRadius: 8, padding: '7px 16px',
                color: WHITE, fontSize: 16, fontWeight: 600,
              }}>{f}</div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3: Description / Value props ───────────────────────────────────────

const SceneValueProps: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Price comparison bar animation
  const avgBarW = interpolate(frame, [80, 130], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ourBarW = interpolate(frame, [100, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Blurred photo bg */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Img src={VEHICLE.photos[2]} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.18)', transform: 'scale(1.1)' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: TEAL }} />

      <AbsoluteFill style={{ padding: '48px 80px', flexDirection: 'row', gap: 60, fontFamily: 'system-ui, sans-serif' }}>
        {/* Left: selling points */}
        <div style={{ flex: 1 }}>
          <div style={{ opacity: fadeIn(frame, 0, 15), color: TEAL_LIGHT, fontSize: 15, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 10 }}>
            Why It's a Smart Choice
          </div>
          <div style={{ opacity: fadeIn(frame, 8, 20), color: WHITE, fontSize: 36, fontWeight: 900, marginBottom: 32 }}>
            A lot of car for $17,995.
          </div>

          {VEHICLE.sellingPoints.map((pt, i) => {
            const delay = 25 + i * 20;
            const x = interpolate(frame, [delay, delay + 22], [-50, 0], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              easing: Easing.out(Easing.quad),
            });
            return (
              <div key={i} style={{
                opacity: fadeIn(frame, delay, 18),
                transform: `translateX(${x}px)`,
                display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20,
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderLeft: `3px solid ${TEAL}`,
                borderRadius: '0 10px 10px 0',
                padding: '12px 18px',
              }}>
                <div style={{ fontSize: 24, flexShrink: 0 }}>{pt.icon}</div>
                <div>
                  <div style={{ color: WHITE, fontSize: 18, fontWeight: 700 }}>{pt.headline}</div>
                  <div style={{ color: SLATE, fontSize: 15, marginTop: 3, lineHeight: 1.5 }}>{pt.detail}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: price comparison */}
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ opacity: fadeIn(frame, 60, 20), color: TEAL_LIGHT, fontSize: 14, textTransform: 'uppercase', letterSpacing: 3, marginBottom: 24 }}>
            LA Market Comparison
          </div>

          {/* Avg market price bar */}
          <div style={{ opacity: fadeIn(frame, 75, 20), marginBottom: 24 }}>
            <div style={{ color: SLATE, fontSize: 15, marginBottom: 8 }}>
              Avg. 2024 HR-V Sport in LA (~{VEHICLE.avgMarketMiles.toLocaleString()} mi)
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 36, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${avgBarW * 100}%`, height: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 }} />
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: WHITE, fontSize: 18, fontWeight: 700 }}>
                ~$24,000
              </div>
            </div>
          </div>

          {/* Our price bar */}
          <div style={{ opacity: fadeIn(frame, 90, 20), marginBottom: 28 }}>
            <div style={{ color: TEAL_LIGHT, fontSize: 15, marginBottom: 8, fontWeight: 600 }}>
              Apollo Auto — {VEHICLE.mileage.toLocaleString()} miles
            </div>
            <div style={{ backgroundColor: 'rgba(13,148,136,0.15)', border: `1.5px solid ${TEAL}`, borderRadius: 6, height: 36, overflow: 'hidden', position: 'relative' }}>
              <div style={{ width: `${ourBarW * 75}%`, height: '100%', backgroundColor: TEAL, borderRadius: 6 }} />
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: WHITE, fontSize: 18, fontWeight: 800 }}>
                $17,995
              </div>
            </div>
          </div>

          {/* Savings callout */}
          <div style={{
            opacity: fadeIn(frame, 140, 25),
            backgroundColor: 'rgba(13,148,136,0.15)',
            border: `2px solid ${TEAL}`,
            borderRadius: 12,
            padding: '16px 20px',
            textAlign: 'center',
          }}>
            <div style={{ color: SLATE, fontSize: 14 }}>You save approximately</div>
            <div style={{ color: TEAL_LIGHT, fontSize: 40, fontWeight: 900, lineHeight: 1.1 }}>$6,000+</div>
            <div style={{ color: SLATE, fontSize: 13, marginTop: 4 }}>vs. comparable LA listings</div>
          </div>

          {/* Salvage disclosure */}
          <div style={{ opacity: fadeIn(frame, 160, 20), marginTop: 16 }}>
            <SalvageBadge startFrame={160} />
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              Salvage title is reflected in the price. Vehicle drives well — come see it in person.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Scene 4: Price + CTA ──────────────────────────────────────────────────────

const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const priceScale = spring({ frame: frame - 20, fps, config: { damping: 9, stiffness: 80 } });
  const btnScale   = spring({ frame: frame - 80, fps, config: { damping: 12 } });
  const btnPulse   = 1 + Math.sin(frame * 0.15) * 0.022;

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <Img src={VEHICLE.photos[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(0.2)', transform: 'scale(1.1)' }} />
      </div>
      <Particles count={28} color={TEAL} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: 60 }}>

        {/* Vehicle name */}
        <div style={{ opacity: fadeIn(frame, 0, 20), color: TEAL_LIGHT, fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>
          {VEHICLE.year} {VEHICLE.make} {VEHICLE.model} {VEHICLE.trim}
        </div>

        {/* Salvage badge */}
        <div style={{ marginBottom: 16 }}><SalvageBadge startFrame={5} /></div>

        {/* Price */}
        <div style={{
          transform: `scale(${priceScale})`,
          color: WHITE, fontSize: 96, fontWeight: 900, lineHeight: 1,
          marginBottom: 8, textShadow: `0 0 60px ${TEAL}`,
        }}>
          ${VEHICLE.price.toLocaleString()}
        </div>

        <div style={{ opacity: fadeIn(frame, 45, 20), color: SLATE, fontSize: 20, marginBottom: 36 }}>
          {VEHICLE.mileage.toLocaleString()} miles &nbsp;·&nbsp; {VEHICLE.color} / {VEHICLE.interior} &nbsp;·&nbsp; VIN: {VEHICLE.vin}
        </div>

        {/* Tagline pills */}
        <div style={{ opacity: fadeIn(frame, 55, 20), display: 'flex', gap: 10, marginBottom: 36, flexWrap: 'wrap', justifyContent: 'center' }}>
          {DEALER.taglines.map((t, i) => (
            <div key={i} style={{
              backgroundColor: 'rgba(13,148,136,0.15)',
              border: `1px solid ${TEAL}`,
              borderRadius: 20, padding: '6px 16px',
              color: TEAL_LIGHT, fontSize: 15, fontWeight: 600,
            }}>{t}</div>
          ))}
        </div>

        {/* Phone CTA */}
        <div style={{
          transform: `scale(${btnScale * btnPulse})`,
          backgroundColor: TEAL, color: WHITE,
          fontSize: 30, fontWeight: 800,
          padding: '18px 52px', borderRadius: 14,
          marginBottom: 20, boxShadow: `0 0 50px rgba(13,148,136,0.5)`,
        }}>
          Call or Text: {DEALER.phone}
        </div>

        {/* Dealer info block */}
        <div style={{ opacity: fadeIn(frame, 100, 25), textAlign: 'center' }}>
          <div style={{ color: WHITE, fontSize: 22, fontWeight: 800 }}>{DEALER.name}</div>
          <div style={{ color: SLATE, fontSize: 16, marginTop: 4 }}>{DEALER.address}</div>
          <div style={{ color: TEAL_LIGHT, fontSize: 18, marginTop: 6, fontWeight: 700 }}>
            www.{DEALER.website} &nbsp;·&nbsp; Simi Valley: {DEALER.phoneSimi}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────

const S1 = 270;  // 9s  — Hero
const S2 = 450;  // 15s — Gallery
const S3 = 270;  // 9s  — Value props / description
const S4 = 210;  // 7s  — Price + CTA
export const SHOWCASE_DURATION = S1 + S2 + S3 + S4; // 40s

export const VehicleShowcase: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
    <Audio src={staticFile('remotion/vehicle-narration.mp3')} />
    <Sequence from={0}            durationInFrames={S1}><SceneHero /></Sequence>
    <Sequence from={S1}           durationInFrames={S2}><SceneGallery /></Sequence>
    <Sequence from={S1 + S2}      durationInFrames={S3}><SceneValueProps /></Sequence>
    <Sequence from={S1 + S2 + S3} durationInFrames={S4}><SceneCTA /></Sequence>
    <ProgressBarInner totalFrames={SHOWCASE_DURATION} />
  </AbsoluteFill>
);

