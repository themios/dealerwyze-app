// Legacy route — slug-based URLs required. Returns 410 Gone.
// Update CarGurus portal to use /api/inventory/cargurus-feed/[your-slug].
export const runtime = 'nodejs'

export function GET() {
  return new Response('Feed URL has moved. Use /api/inventory/cargurus-feed/[slug] instead.', { status: 410 })
}
