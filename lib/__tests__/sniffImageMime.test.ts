import { describe, expect, it } from 'vitest'
import { sniffImageMime } from '@/lib/uploads/sniffImageMime'

describe('sniffImageMime', () => {
  it('detects JPEG', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
    expect(sniffImageMime(buf.buffer)).toBe('image/jpeg')
  })

  it('detects PNG', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    expect(sniffImageMime(buf.buffer)).toBe('image/png')
  })

  it('detects WebP', () => {
    const buf = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
    expect(sniffImageMime(buf.buffer)).toBe('image/webp')
  })

  it('rejects garbage', () => {
    expect(sniffImageMime(new Uint8Array([1, 2, 3]).buffer)).toBeNull()
  })
})
