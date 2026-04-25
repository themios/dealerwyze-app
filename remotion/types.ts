// Remotion-local types — defined here to avoid Next.js / Remotion module boundary issues.
// Keep in sync with lib/remotion/types.ts.

export interface VehicleVideoProps {
  // Dealer branding — from org_settings
  dealerName: string
  dealerCity: string
  dealerState: string
  dealerPhone: string
  dealerWebsite?: string
  dealerLogoUrl?: string
  dealerTagline?: string

  // Vehicle data — from vehicles table
  year: number
  make: string
  model: string
  trim?: string
  price: number
  mileage: number
  color?: string
  interior?: string
  vin?: string
  engine?: string
  mpgCity?: number
  mpgHwy?: number
  isSalvage: boolean
  photos: string[]       // ordered CDN URLs, max 8
  features: string[]     // from vehicle.features jsonb

  // Narration
  narrationUrl?: string  // R2 MP3 URL (optional during preview)

  // Display flags — from org_video_settings
  showPrice: boolean
  showPhone: boolean
  showWatermark: boolean
}

export const DEFAULT_PROPS: VehicleVideoProps = {
  dealerName: 'Apollo Auto',
  dealerCity: 'El Monte',
  dealerState: 'CA',
  dealerPhone: '(626) 555-0100',
  dealerWebsite: 'dealerwyze.com',
  year: 2021,
  make: 'Toyota',
  model: 'Camry',
  trim: 'SE',
  price: 22995,
  mileage: 34000,
  color: 'Midnight Black',
  isSalvage: false,
  photos: [
    'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=1280&q=80',
    'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=1280&q=80',
    'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=1280&q=80',
    'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1280&q=80',
  ],
  features: ['Backup Camera', 'Apple CarPlay', 'Lane Departure Warning', 'Heated Seats'],
  showPrice: true,
  showPhone: true,
  showWatermark: true,
}
