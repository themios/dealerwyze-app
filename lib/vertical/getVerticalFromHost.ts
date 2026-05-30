import { headers } from 'next/headers'

export type VerticalType = 'dealer' | 'real_estate'

interface VerticalConfig {
  vertical: VerticalType
  productName: string
  brandDomain: string
  privacyEmail: string
  legalEmail: string
  dmcaEmail: string
  supportEmail: string
}

const verticalConfigs: Record<string, VerticalConfig> = {
  dealerwyze: {
    vertical: 'dealer',
    productName: 'DealerWyze',
    brandDomain: 'dealerwyze.com',
    privacyEmail: 'privacy@dealerwyze.com',
    legalEmail: 'legal@dealerwyze.com',
    dmcaEmail: 'dmca@dealerwyze.com',
    supportEmail: 'support@dealerwyze.com',
  },
  realtywyze: {
    vertical: 'real_estate',
    productName: 'RealtyWyze',
    brandDomain: 'realtywyze.us',
    privacyEmail: 'privacy@realtywyze.us',
    legalEmail: 'legal@realtywyze.us',
    dmcaEmail: 'dmca@realtywyze.us',
    supportEmail: 'support@realtywyze.us',
  },
}

export async function getVerticalFromHost(): Promise<VerticalConfig> {
  const headersList = await headers()
  const host = headersList.get('host') || 'dealerwyze.com'

  const hostname = host.split(':')[0].toLowerCase()

  if (hostname.includes('realtywyze')) {
    return verticalConfigs.realtywyze
  }

  return verticalConfigs.dealerwyze
}
