export type { Vertical, VerticalConfig, VerticalLabels, VerticalFeatures } from './types'
export { dealerConfig } from './dealer'
export { realEstateConfig } from './realEstate'

import type { Vertical, VerticalConfig } from './types'
import { dealerConfig } from './dealer'
import { realEstateConfig } from './realEstate'

export function getVerticalConfig(vertical: Vertical): VerticalConfig {
  return vertical === 'real_estate' ? realEstateConfig : dealerConfig
}
