import { describe, expect, it } from 'vitest'
import { sanitizeEmailHeaderText } from '@/lib/email/header'

describe('sanitizeEmailHeaderText', () => {
  it('converts decorative unicode into safe ASCII header text', () => {
    expect(sanitizeEmailHeaderText('2015 Honda Civic - 𝓐𝓹𝓸𝓵𝓵𝓸 𝓐𝓾𝓽𝓸')).toBe(
      '2015 Honda Civic - Apollo Auto',
    )
  })

  it('removes replacement characters and header-breaking whitespace', () => {
    expect(sanitizeEmailHeaderText('Apollo\r\nAuto \uFFFD')).toBe('Apollo Auto')
  })
})
