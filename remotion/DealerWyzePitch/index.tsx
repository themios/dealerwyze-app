import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
} from 'remotion';
import {
  ORANGE, DARK, SLATE, WHITE, GREEN, RED, BLUE,
  fadeIn, slideUpVal, useSpring,
  ProgressBar, GradientBg, KineticText, Particles, Ripple,
} from '../components/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Scene 1 — Hook: The 9:02 story
// ─────────────────────────────────────────────────────────────────────────────

const AnimatedClock: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  // Hour hand: 9:02 (270°) → 11:30 (345°)
  const hourAngle = interpolate(frame, [startFrame, startFrame + 120], [270, 345], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });
  // Minute hand: :02 (12°) → :30 (180°)
  const minuteAngle = interpolate(frame, [startFrame, startFrame + 120], [12, 180], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });
  const op = fadeIn(frame, startFrame - 10, 20);

  return (
    <svg width="160" height="160" viewBox="0 0 160 160" style={{ opacity: op }}>
      {/* Face */}
      <circle cx="80" cy="80" r="76" fill="none" stroke={ORANGE} strokeWidth="3" opacity="0.3" />
      <circle cx="80" cy="80" r="70" fill="rgba(249,115,22,0.06)" />
      {/* Hour markers */}
      {[...Array(12)].map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        return (
          <line
            key={i}
            x1={80 + Math.cos(a) * 58}
            y1={80 + Math.sin(a) * 58}
            x2={80 + Math.cos(a) * 66}
            y2={80 + Math.sin(a) * 66}
            stroke={SLATE}
            strokeWidth={i % 3 === 0 ? 3 : 1.5}
            opacity="0.5"
          />
        );
      })}
      {/* Hour hand */}
      <line
        x1="80" y1="80"
        x2={80 + Math.cos((hourAngle - 90) * Math.PI / 180) * 36}
        y2={80 + Math.sin((hourAngle - 90) * Math.PI / 180) * 36}
        stroke={WHITE} strokeWidth="5" strokeLinecap="round"
      />
      {/* Minute hand */}
      <line
        x1="80" y1="80"
        x2={80 + Math.cos((minuteAngle - 90) * Math.PI / 180) * 52}
        y2={80 + Math.sin((minuteAngle - 90) * Math.PI / 180) * 52}
        stroke={ORANGE} strokeWidth="3" strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx="80" cy="80" r="5" fill={ORANGE} />
    </svg>
  );
};

const LeadNotification: React.FC<{
  source: string;
  message: string;
  color: string;
  icon: string;
  startFrame: number;
  isLate?: boolean;
}> = ({ source, message, color, icon, startFrame, isLate }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [startFrame, startFrame + 22], [420, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.2)),
  });
  const op = fadeIn(frame, startFrame, 15);

  return (
    <div style={{
      opacity: op,
      transform: `translateX(${x}px)`,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      backgroundColor: isLate ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
      border: `1.5px solid ${isLate ? RED : color}`,
      borderRadius: 14,
      padding: '14px 20px',
      marginBottom: 14,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ fontSize: 28, width: 36, textAlign: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: isLate ? RED : color, fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>{source}</div>
        <div style={{ color: WHITE, fontSize: 18 }}>{message}</div>
      </div>
      {isLate && (
        <div style={{ backgroundColor: RED, color: WHITE, fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 8 }}>
          TOO LATE
        </div>
      )}
    </div>
  );
};

const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const lostDealOpacity = fadeIn(frame, 150, 25);
  const lostDealScale = spring({ frame: frame - 150, fps: 30, config: { damping: 10, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      <GradientBg color1={DARK} color2="#100a1f" speed={0.002} />

      <AbsoluteFill style={{ padding: '60px 80px', flexDirection: 'row', alignItems: 'center', gap: 60 }}>
        {/* Left: Clock + label */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <AnimatedClock startFrame={20} />
          <div style={{ opacity: fadeIn(frame, 30, 20), color: SLATE, fontSize: 18, textAlign: 'center' }}>
            Time passing<br />while you're busy
          </div>
        </div>

        {/* Right: notifications + headline */}
        <div style={{ flex: 1 }}>
          <KineticText
            text="Sound familiar?"
            startFrame={10}
            wordDelay={8}
            style={{ marginBottom: 28 }}
            wordStyle={{ color: SLATE, fontSize: 20, textTransform: 'uppercase', letterSpacing: 4 }}
          />
          <KineticText
            text="A buyer asks about your car at 9:02 AM."
            startFrame={20}
            wordDelay={5}
            style={{ marginBottom: 32 }}
            wordStyle={{ color: WHITE, fontSize: 36, fontWeight: 800, lineHeight: 1.3 }}
          />

          <LeadNotification source="CarGurus" message="New inquiry on 2009 Acura MDX" color={GREEN} icon="🔔" startFrame={55} />
          <LeadNotification source="Competitor" message="Replied at 9:05 AM" color={BLUE} icon="⚡" startFrame={80} />
          <LeadNotification source="Competitor" message="Replied at 9:07 AM" color={BLUE} icon="⚡" startFrame={100} />
          <LeadNotification source="You" message="Replied at 11:30 AM" color={RED} icon="💬" startFrame={125} isLate />
        </div>
      </AbsoluteFill>

      {/* Bottom punch line */}
      <div style={{
        position: 'absolute', bottom: 60, left: 80, right: 80,
        opacity: lostDealOpacity,
        transform: `scale(${lostDealScale})`,
        backgroundColor: 'rgba(239,68,68,0.12)',
        border: `2px solid ${RED}`,
        borderRadius: 16,
        padding: '20px 36px',
        textAlign: 'center',
        color: WHITE,
        fontSize: 26,
        fontWeight: 700,
      }}>
        You didn't lose that deal because your car was worse.{' '}
        <span style={{ color: ORANGE }}>You lost it because you replied late.</span>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene 2 — Solution: One place, fast replies, nothing missed
// ─────────────────────────────────────────────────────────────────────────────

const StatBadge: React.FC<{ value: string; label: string; color: string; startFrame: number }> = ({
  value, label, color, startFrame,
}) => {
  const frame = useCurrentFrame();
  const scale = spring({ frame: frame - startFrame, fps: 30, config: { damping: 11, stiffness: 130 } });
  return (
    <div style={{
      transform: `scale(${scale})`,
      backgroundColor: 'rgba(255,255,255,0.05)',
      border: `2px solid ${color}`,
      borderRadius: 20,
      padding: '20px 28px',
      textAlign: 'center',
      flex: 1,
    }}>
      <div style={{ color, fontSize: 44, fontWeight: 900, lineHeight: 1 }}>{value}</div>
      <div style={{ color: SLATE, fontSize: 16, marginTop: 8 }}>{label}</div>
    </div>
  );
};

const DashboardMockup: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const op = fadeIn(frame, startFrame, 20);
  const leads = [
    { name: 'Maria G.', car: '2019 Honda Civic', time: '2 min ago', hot: true },
    { name: 'James T.', car: '2021 Toyota RAV4', time: '8 min ago', hot: false },
    { name: 'Sofia R.', car: '2018 Ford F-150', time: '14 min ago', hot: false },
  ];
  return (
    <div style={{ opacity: op, backgroundColor: 'rgba(15,23,42,0.8)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ backgroundColor: 'rgba(249,115,22,0.15)', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: ORANGE }} />
        <div style={{ color: ORANGE, fontSize: 15, fontWeight: 700 }}>TODAY — 3 leads waiting</div>
      </div>
      {leads.map((l, i) => {
        const rowOp = fadeIn(frame, startFrame + 15 + i * 12, 12);
        return (
          <div key={i} style={{
            opacity: rowOp,
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            {l.hot && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: ORANGE, flexShrink: 0 }} />}
            {!l.hot && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'transparent', flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ color: WHITE, fontSize: 17, fontWeight: 600 }}>{l.name}</div>
              <div style={{ color: SLATE, fontSize: 14 }}>{l.car}</div>
            </div>
            <div style={{ color: SLATE, fontSize: 13 }}>{l.time}</div>
            <div style={{ backgroundColor: ORANGE, color: WHITE, fontSize: 13, fontWeight: 700, padding: '5px 14px', borderRadius: 8 }}>Reply</div>
          </div>
        );
      })}
    </div>
  );
};

const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      <GradientBg color1="#070d1a" color2="#0f1e10" speed={0.0015} />

      <AbsoluteFill style={{ padding: '50px 80px' }}>
        {/* Header */}
        <div style={{ opacity: fadeIn(frame, 0, 15), color: ORANGE, fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 8 }}>
          DealerWyze
        </div>
        <KineticText
          text="One place. Every lead. Every next step."
          startFrame={10}
          wordDelay={6}
          style={{ marginBottom: 36 }}
          wordStyle={{ color: WHITE, fontSize: 44, fontWeight: 900, lineHeight: 1.2 }}
        />

        {/* Two column layout */}
        <div style={{ display: 'flex', gap: 40, flex: 1 }}>
          {/* Left: Dashboard mockup */}
          <div style={{ flex: 1 }}>
            <DashboardMockup startFrame={40} />
          </div>

          {/* Right: Benefits */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { icon: '📥', title: 'One inbox', body: 'Gmail, CarGurus, AutoTrader, texts — ranked by urgency.', delay: 50 },
              { icon: '⚡', title: 'Reply in 60 seconds', body: 'Templates auto-fill the name, car, price, and listing link.', delay: 80 },
              { icon: '✅', title: 'Zero forgotten leads', body: 'Every call creates a task. Response time is tracked automatically.', delay: 110 },
            ].map((b, i) => {
              const scale = spring({ frame: frame - b.delay, fps: 30, config: { damping: 13 } });
              return (
                <div key={i} style={{
                  transform: `scale(${scale})`,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderLeft: `4px solid ${ORANGE}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex', gap: 16, alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{b.icon}</div>
                  <div>
                    <div style={{ color: WHITE, fontSize: 20, fontWeight: 700 }}>{b.title}</div>
                    <div style={{ color: SLATE, fontSize: 16, marginTop: 4 }}>{b.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stat badges */}
        <div style={{ display: 'flex', gap: 20, marginTop: 28 }}>
          <StatBadge value="< 60s" label="avg reply time" color={GREEN} startFrame={150} />
          <StatBadge value="1" label="inbox instead of 5" color={ORANGE} startFrame={165} />
          <StatBadge value="0" label="leads fall through" color={BLUE} startFrame={180} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene 3 — Objections answered
// ─────────────────────────────────────────────────────────────────────────────

const ObjectionCard: React.FC<{
  objection: string;
  answer: string;
  startFrame: number;
}> = ({ objection, answer, startFrame }) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [startFrame, startFrame + 28], [-600, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.1)),
  });
  const answerOp = fadeIn(frame, startFrame + 35, 20);
  const answerX = interpolate(frame, [startFrame + 35, startFrame + 55], [60, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Objection */}
      <div style={{
        transform: `translateX(${x}px)`,
        display: 'flex', alignItems: 'center', gap: 16,
        backgroundColor: 'rgba(239,68,68,0.08)',
        border: `1.5px solid rgba(239,68,68,0.3)`,
        borderRadius: 14, padding: '16px 24px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 24 }}>🚧</div>
        <div style={{ color: '#fca5a5', fontSize: 22, fontStyle: 'italic' }}>{objection}</div>
      </div>
      {/* Answer */}
      <div style={{
        opacity: answerOp,
        transform: `translateX(${answerX}px)`,
        display: 'flex', alignItems: 'flex-start', gap: 16,
        backgroundColor: 'rgba(34,197,94,0.08)',
        border: `1.5px solid rgba(34,197,94,0.3)`,
        borderRadius: 14, padding: '16px 24px',
      }}>
        <div style={{ fontSize: 24 }}>✅</div>
        <div style={{ color: WHITE, fontSize: 20, lineHeight: 1.6 }}>{answer}</div>
      </div>
    </div>
  );
};

const SceneObjections: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      <GradientBg color1="#0a0f1e" color2="#0f0a1e" speed={0.002} />

      <AbsoluteFill style={{ padding: '60px 80px' }}>
        <div style={{ opacity: fadeIn(frame, 0, 15), color: SLATE, fontSize: 18, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 12 }}>
          We've heard it
        </div>
        <KineticText
          text="Every objection. Answered."
          startFrame={10}
          wordDelay={8}
          style={{ marginBottom: 48 }}
          wordStyle={{ color: WHITE, fontSize: 48, fontWeight: 900 }}
        />

        <ObjectionCard
          objection={`"We're too small for a CRM."`}
          answer="DealerWyze is built for small lots and BHPH. The dealers who feel too small are exactly the ones losing deals to the lot that replied at 9:05."
          startFrame={30}
        />
        <ObjectionCard
          objection={`"We don't have time to learn something new."`}
          answer="First reply is: pick a template, hit send. The learning curve is one day. The payoff is fewer lost leads every week."
          startFrame={100}
        />

        {/* Cost of inaction bar */}
        <div style={{
          opacity: fadeIn(frame, 175, 20),
          backgroundColor: 'rgba(249,115,22,0.1)',
          border: `1px solid rgba(249,115,22,0.4)`,
          borderRadius: 14,
          padding: '16px 24px',
          color: SLATE,
          fontSize: 18,
          lineHeight: 1.6,
        }}>
          Every week you stay on scattered inboxes,{' '}
          <span style={{ color: WHITE, fontWeight: 600 }}>more leads slip to the dealer who answered first.</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene 4 — CTA
// ─────────────────────────────────────────────────────────────────────────────

const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame: frame - 20, fps, config: { damping: 11, stiffness: 90 } });
  const btnScale = spring({ frame: frame - 80, fps, config: { damping: 12, stiffness: 100 } });
  const btnPulse = 1 + Math.sin(frame * 0.12) * 0.025;

  return (
    <AbsoluteFill style={{ fontFamily: 'system-ui, sans-serif' }}>
      <GradientBg color1={DARK} color2="#1a0a00" speed={0.0018} />
      <Particles count={40} color={ORANGE} />
      <Ripple color={ORANGE} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: 80 }}>

        <div style={{ opacity: fadeIn(frame, 0, 20), color: SLATE, fontSize: 20, textTransform: 'uppercase', letterSpacing: 4, marginBottom: 24, textAlign: 'center' }}>
          The question isn't whether you can afford a CRM.
        </div>

        <div style={{
          transform: `scale(${scale})`,
          color: WHITE,
          fontSize: 56,
          fontWeight: 900,
          textAlign: 'center',
          lineHeight: 1.15,
          marginBottom: 56,
          maxWidth: 900,
        }}>
          Can you afford to keep losing deals to{' '}
          <span style={{ color: ORANGE }}>the one who replied at 9:05?</span>
        </div>

        {/* CTA Button */}
        <div style={{
          transform: `scale(${btnScale * btnPulse})`,
          backgroundColor: ORANGE,
          color: WHITE,
          fontSize: 30,
          fontWeight: 800,
          padding: '22px 64px',
          borderRadius: 16,
          marginBottom: 36,
          boxShadow: '0 0 60px rgba(249,115,22,0.4)',
          letterSpacing: 1,
        }}>
          Try DealerWyze Free
        </div>

        {/* URL */}
        <div style={{ opacity: fadeIn(frame, 100, 25), color: SLATE, fontSize: 24, letterSpacing: 3 }}>
          dealerwyze.com
        </div>

        {/* Tagline */}
        <div style={{
          opacity: fadeIn(frame, 130, 30),
          marginTop: 40,
          color: 'rgba(255,255,255,0.3)',
          fontSize: 18,
          textAlign: 'center',
          letterSpacing: 1,
        }}>
          One place for every lead, every car, every next step.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Root composition
// ─────────────────────────────────────────────────────────────────────────────

const S1 = 660;  // 22s — Hook
const S2 = 750;  // 25s — Solution
const S3 = 660;  // 22s — Objections
const S4 = 780;  // 26s — CTA
export const PITCH_DURATION = S1 + S2 + S3 + S4; // 95s total

export const DealerWyzePitch: React.FC = () => (
  <AbsoluteFill>
    {/* Narration audio runs across the full composition */}
    <Audio src={staticFile('remotion/narration.mp3')} />

    <Sequence from={0}            durationInFrames={S1}><SceneHook /></Sequence>
    <Sequence from={S1}           durationInFrames={S2}><SceneSolution /></Sequence>
    <Sequence from={S1 + S2}      durationInFrames={S3}><SceneObjections /></Sequence>
    <Sequence from={S1 + S2 + S3} durationInFrames={S4}><SceneCTA /></Sequence>

    {/* Progress bar sits above all scenes */}
    <ProgressBar totalFrames={PITCH_DURATION} />
  </AbsoluteFill>
);
