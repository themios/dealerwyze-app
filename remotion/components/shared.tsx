import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ORANGE = '#f97316';
export const DARK   = '#0a0f1e';
export const SLATE  = '#94a3b8';
export const WHITE  = '#f8fafc';
export const GREEN  = '#22c55e';
export const RED    = '#ef4444';
export const BLUE   = '#3b82f6';

export const fadeIn = (frame: number, start = 0, duration = 20) =>
  interpolate(frame, [start, start + duration], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

export const slideUpVal = (frame: number, start = 0, distance = 40) =>
  interpolate(frame, [start, start + 24], [distance, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' });

export const useSpring = (frame: number, delay = 0, fps = 30) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120 } });

// ── Progress Bar ──────────────────────────────────────────────────────────────

export const ProgressBar: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const progress = frame / totalFrames;
  const fillWidth = Math.round(progress * width);
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, width, height: 4, backgroundColor: 'rgba(255,255,255,0.1)' }}>
      <div style={{ height: '100%', width: fillWidth, backgroundColor: ORANGE }} />
    </div>
  );
};

// ── Animated Gradient Background ─────────────────────────────────────────────

export const GradientBg: React.FC<{ color1?: string; color2?: string; speed?: number }> = ({
  color1 = '#0a0f1e',
  color2 = '#111827',
  speed = 0.003,
}) => {
  const frame = useCurrentFrame();
  const t = Math.sin(frame * speed) * 0.5 + 0.5;
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(ellipse at ${30 + t * 40}% ${20 + t * 30}%, ${color2} 0%, ${color1} 70%)`,
      }}
    />
  );
};

// ── Kinetic Text (word by word) ───────────────────────────────────────────────

export const KineticText: React.FC<{
  text: string;
  startFrame: number;
  wordDelay?: number;
  style?: React.CSSProperties;
  wordStyle?: React.CSSProperties;
}> = ({ text, startFrame, wordDelay = 4, style, wordStyle }) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25em', ...style }}>
      {words.map((word, i) => {
        const delay = startFrame + i * wordDelay;
        const op = fadeIn(frame, delay, 10);
        const y = slideUpVal(frame, delay, 16);
        return (
          <span key={i} style={{ opacity: op, transform: `translateY(${y}px)`, display: 'inline-block', ...wordStyle }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

// ── Floating Particles ────────────────────────────────────────────────────────

export const Particles: React.FC<{ count?: number; color?: string }> = ({ count = 30, color = ORANGE }) => {
  const frame = useCurrentFrame();
  // Deterministic layout — no Math.random() (would flicker across frames)
  const dots = Array.from({ length: count }, (_, i) => {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = 8 + col * 16 + (row % 2) * 8;
    const y = 8 + row * 18;
    const phase = (i * 37) % 100;
    const pulse = Math.sin((frame * 0.04) + phase * 0.1) * 0.5 + 0.5;
    return { x, y, pulse, size: 3 + (i % 3) };
  });

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.size * 0.3 * d.pulse} fill={color} opacity={d.pulse} />
      ))}
    </svg>
  );
};

// ── Ripple / Pulse ────────────────────────────────────────────────────────────

export const Ripple: React.FC<{ cx?: string; cy?: string; color?: string }> = ({
  cx = '50%', cy = '50%', color = ORANGE,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const rings = [0, 30, 60];
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox={`0 0 ${width} ${height}`}>
      {rings.map((offset, i) => {
        const t = ((frame + offset) % 90) / 90;
        const r = 60 + t * 300;
        const op = (1 - t) * 0.3;
        return <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2} opacity={op} />;
      })}
    </svg>
  );
};
