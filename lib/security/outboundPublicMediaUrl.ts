/**
 * Validates URLs passed to outbound HTTP clients (Meta fetches dealer media URLs).
 * Reduces SSRF risk: HTTPS only, rejects link-local/private/reserved IPs in host literals,
 * rejects obvious localhost / metadata-host patterns.
 */

function parseIPv4Literal(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(p => Number(p))
  if (!nums.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) return null
  return nums
}

/**
 * Reserved / non-public literals we never want Meta or our tier to dereference internally.
 */
function isBlockedIpv4(hostname: string): boolean {
  const nums = parseIPv4Literal(hostname)
  if (!nums) return false
  const [a, b] = nums
  // 10.0.0.0/8
  if (a === 10) return true
  // 127.0.0.0/8
  if (a === 127) return true
  // 0.0.0.0/8
  if (a === 0) return true
  // 169.254.0.0/16
  if (a === 169 && b === 254) return true
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true
  // 172.16.0.0–172.31.255.255
  if (a === 172 && b >= 16 && b <= 31) return true
  // 100.64.0.0/10 (CGNAT — treat as internal)
  if (a === 100 && b >= 64 && b <= 127) return true

  return false
}

// Substrings that must never appear anywhere in the hostname.
// Using substring match catches all variants: metadata.google.internal, foo.localhost, etc.
const BLOCKED_HOSTNAME_SUBSTRINGS = [
  'localhost',
  'metadata.google',
  'metadata.gce',
]

export function assertSafeOutboundMediaUrl(raw: string): void {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Empty media URL')
  }
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    throw new Error('Invalid media URL')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Media URL must be http(s)')
  }
  if (process.env.NODE_ENV === 'production' && u.protocol !== 'https:') {
    throw new Error('Media URL must use HTTPS')
  }

  const host = u.hostname.toLowerCase()
  for (const s of BLOCKED_HOSTNAME_SUBSTRINGS) {
    if (host.includes(s)) {
      throw new Error('Media host is not permitted')
    }
  }
  // IPv6 loopback / link-local
  if (
    host === '[::1]' ||
    host.startsWith('fec0:') ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd')
  ) {
    throw new Error('Media host is not permitted')
  }
  if (isBlockedIpv4(host)) {
    throw new Error('Private or non-routable media host is not permitted')
  }

  const username = u.username.trim()
  if (username !== '' || u.password !== '') {
    throw new Error('Embedded credentials in media URL are not permitted')
  }
}
