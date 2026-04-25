import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export type VehicleListingProps = {
  year: number;
  make: string;
  model: string;
  price: number;
  mileage: number;
  photoUrl: string;
  dealerName: string;
};

export const VehicleListing: React.FC<VehicleListingProps> = ({
  year,
  make,
  model,
  price,
  mileage,
  photoUrl,
  dealerName,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const priceScale = spring({ frame: frame - 30, fps, config: { damping: 12 } });
  const detailsOpacity = interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f172a', fontFamily: 'sans-serif' }}>
      {/* Photo */}
      <AbsoluteFill>
        <Img
          src={photoUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }}
        />
      </AbsoluteFill>

      {/* Gradient overlay */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 40%, transparent 100%)',
        }}
      />

      {/* Content */}
      <AbsoluteFill style={{ padding: 60, justifyContent: 'flex-end' }}>
        {/* Title */}
        <div style={{ opacity: titleOpacity }}>
          <div style={{ color: '#f97316', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            {dealerName}
          </div>
          <div style={{ color: 'white', fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
            {year} {make} {model}
          </div>
        </div>

        {/* Price */}
        <div
          style={{
            transform: `scale(${priceScale})`,
            color: '#f97316',
            fontSize: 80,
            fontWeight: 900,
            marginTop: 16,
          }}
        >
          ${price.toLocaleString()}
        </div>

        {/* Details */}
        <div style={{ opacity: detailsOpacity, color: '#cbd5e1', fontSize: 32, marginTop: 12 }}>
          {mileage.toLocaleString()} miles
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
