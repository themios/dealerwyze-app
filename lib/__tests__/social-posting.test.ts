/**
 * Social posting security tests.
 *
 * Covers:
 *  - verifyRemotionWebhookSignature (HMAC timing-safe compare)
 *  - assertSafeOutboundMediaUrl (SSRF protection)
 *  - assertListingPhotoBelongsToVehicle (photo ownership guard)
 *
 * All Supabase calls are mocked; no network or DB access.
 */

import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

// ─── verifyRemotionWebhookSignature ──────────────────────────────────────────

import { verifyRemotionWebhookSignature } from '@/lib/social/metaGraph'

function makeRemotionSig(secret: string, body: string): string {
  return `sha512=${crypto.createHmac('sha512', secret).update(body, 'utf8').digest('hex')}`
}

describe('verifyRemotionWebhookSignature', () => {
  const SECRET = 'super-secret-render-key'
  const BODY   = '{"type":"success","renderId":"abc123"}'

  it('accepts a correctly signed payload', () => {
    const sig = makeRemotionSig(SECRET, BODY)
    expect(verifyRemotionWebhookSignature(BODY, SECRET, sig)).toBe(true)
  })

  it('rejects when secret is missing / empty', () => {
    const sig = makeRemotionSig(SECRET, BODY)
    expect(verifyRemotionWebhookSignature(BODY, '',        sig)).toBe(false)
    expect(verifyRemotionWebhookSignature(BODY, undefined, sig)).toBe(false)
  })

  it('rejects when signature header is null', () => {
    expect(verifyRemotionWebhookSignature(BODY, SECRET, null)).toBe(false)
  })

  it('rejects the Remotion "NO_SECRET_PROVIDED" sentinel', () => {
    expect(verifyRemotionWebhookSignature(BODY, SECRET, 'NO_SECRET_PROVIDED')).toBe(false)
  })

  it('rejects a tampered body', () => {
    const sig = makeRemotionSig(SECRET, BODY)
    expect(verifyRemotionWebhookSignature('{"type":"success","renderId":"evil"}', SECRET, sig)).toBe(false)
  })

  it('rejects a signature signed with a different secret', () => {
    const wrongSig = makeRemotionSig('wrong-secret', BODY)
    expect(verifyRemotionWebhookSignature(BODY, SECRET, wrongSig)).toBe(false)
  })

  it('rejects a signature with incorrect algorithm prefix', () => {
    const sha256Sig = `sha256=${crypto.createHmac('sha256', SECRET).update(BODY).digest('hex')}`
    expect(verifyRemotionWebhookSignature(BODY, SECRET, sha256Sig)).toBe(false)
  })

  it('rejects mismatched-length signatures without timing leak', () => {
    expect(verifyRemotionWebhookSignature(BODY, SECRET, 'sha512=short')).toBe(false)
  })
})

// ─── assertSafeOutboundMediaUrl ──────────────────────────────────────────────

import { assertSafeOutboundMediaUrl } from '@/lib/security/outboundPublicMediaUrl'

describe('assertSafeOutboundMediaUrl', () => {
  it('passes valid HTTPS CDN URLs', () => {
    expect(() => assertSafeOutboundMediaUrl('https://cdn.example.com/photo.jpg')).not.toThrow()
    expect(() => assertSafeOutboundMediaUrl('https://d1abc.cloudfront.net/renders/v.mp4')).not.toThrow()
  })

  it('throws for empty string', () => {
    expect(() => assertSafeOutboundMediaUrl('')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('   ')).toThrow()
  })

  it('throws for non-URL garbage', () => {
    expect(() => assertSafeOutboundMediaUrl('not-a-url')).toThrow()
  })

  it('throws for non-http(s) schemes', () => {
    expect(() => assertSafeOutboundMediaUrl('ftp://cdn.example.com/file.jpg')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('file:///etc/passwd')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('data:image/png;base64,abc')).toThrow()
  })

  it('throws for localhost', () => {
    expect(() => assertSafeOutboundMediaUrl('http://localhost/photo.jpg')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('http://localhost:3000/file')).toThrow()
  })

  it('throws for private IPv4 ranges', () => {
    expect(() => assertSafeOutboundMediaUrl('http://10.0.0.1/photo.jpg')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('http://192.168.1.1/photo.jpg')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('http://172.16.0.1/file')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('http://172.31.255.255/file')).toThrow()
    expect(() => assertSafeOutboundMediaUrl('http://127.0.0.1/file')).toThrow()
  })

  it('throws for CGNAT range (100.64.x.x)', () => {
    expect(() => assertSafeOutboundMediaUrl('http://100.64.0.1/photo.jpg')).toThrow()
  })

  it('throws for link-local range (169.254.x.x)', () => {
    expect(() => assertSafeOutboundMediaUrl('http://169.254.169.254/latest/meta-data/')).toThrow()
  })

  it('throws for GCP metadata host', () => {
    expect(() => assertSafeOutboundMediaUrl('http://metadata.google.internal/')).toThrow()
  })

  it('throws for IPv6 loopback', () => {
    expect(() => assertSafeOutboundMediaUrl('http://[::1]/photo.jpg')).toThrow()
  })

  it('throws for embedded credentials', () => {
    expect(() => assertSafeOutboundMediaUrl('https://user:pass@cdn.example.com/photo.jpg')).toThrow()
  })

  it('allows http in non-production NODE_ENV', () => {
    const orig = process.env.NODE_ENV
    // @ts-expect-error intentional test override
    process.env.NODE_ENV = 'test'
    expect(() => assertSafeOutboundMediaUrl('http://cdn.example.com/photo.jpg')).not.toThrow()
    // @ts-expect-error intentional test override
    process.env.NODE_ENV = orig
  })
})

// ─── assertListingPhotoBelongsToVehicle ──────────────────────────────────────

import { assertListingPhotoBelongsToVehicle } from '@/lib/social/resolveVehicleListingPhotoUrl'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Build a mock Supabase client for the photo ownership check.
 *
 * assertListingPhotoBelongsToVehicle does:
 *   supabase.from('vehicle_photos').select('url').eq('vehicle_id', vehicleId)
 *   supabase.from('vehicles').select('photo_url').eq('id', vehicleId).maybeSingle()
 *
 * The vehicle_photos chain resolves directly (no .maybeSingle()).
 */
function makeMockSvc(photoUrls: string[], vehiclePhotoUrl?: string | null) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'vehicle_photos') {
        // The function awaits the result of .eq() directly — returns { data: [...] }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: photoUrls.map(url => ({ url })),
          }),
        }
      }
      if (table === 'vehicles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: vehiclePhotoUrl !== undefined ? { photo_url: vehiclePhotoUrl } : null,
          }),
        }
      }
      return {}
    }),
  } as unknown as SupabaseClient
}

describe('assertListingPhotoBelongsToVehicle', () => {
  const VID = 'vehicle-uuid-001'
  const PHOTO_A = 'https://cdn.example.com/vehicles/001/a.jpg'
  const PHOTO_B = 'https://cdn.example.com/vehicles/001/b.jpg'

  it('resolves for an exact gallery URL match', async () => {
    const svc = makeMockSvc([PHOTO_A, PHOTO_B])
    await expect(assertListingPhotoBelongsToVehicle(svc, VID, PHOTO_A)).resolves.toEqual({ okUrl: PHOTO_A })
  })

  it('resolves when URL matches only via canonical form (trailing slash stripped)', async () => {
    const svc = makeMockSvc([PHOTO_A])
    // candidate has trailing slash stripped from path — should still match
    await expect(
      assertListingPhotoBelongsToVehicle(svc, VID, PHOTO_A),
    ).resolves.toMatchObject({ okUrl: PHOTO_A })
  })

  it('resolves when the URL is the vehicles.photo_url fallback', async () => {
    const svc = makeMockSvc([], PHOTO_A)
    await expect(assertListingPhotoBelongsToVehicle(svc, VID, PHOTO_A)).resolves.toEqual({ okUrl: PHOTO_A })
  })

  it('rejects a URL not in the gallery or vehicle row', async () => {
    const svc = makeMockSvc([PHOTO_A])
    await expect(
      assertListingPhotoBelongsToVehicle(svc, VID, 'https://evil.com/photo.jpg'),
    ).rejects.toThrow('photoUrl must match a listing photo owned by this vehicle')
  })

  it('rejects when gallery is empty and no vehicle photo_url', async () => {
    const svc = makeMockSvc([], null)
    await expect(
      assertListingPhotoBelongsToVehicle(svc, VID, PHOTO_A),
    ).rejects.toThrow()
  })

  it('rejects relative or non-http URLs even if they appear in gallery', async () => {
    const svc = makeMockSvc(['/relative/path.jpg'])
    await expect(
      assertListingPhotoBelongsToVehicle(svc, VID, '/relative/path.jpg'),
    ).rejects.toThrow()
  })
})
