// Legacy route — slug-based URLs required. Returns 410 Gone.
// Update Facebook Business Manager to use /api/inventory/facebook-feed/[slug].
export const runtime = 'nodejs'

export function GET() {
  return new Response('Feed URL has moved. Use /api/inventory/facebook-feed/[slug] instead.', { status: 410 })
}
