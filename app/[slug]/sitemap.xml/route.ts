import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, public_inventory_enabled')
    .eq('slug', slug)
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('public_slug, created_at')
    .eq('user_id', org.id)
    .eq('published', true)
    .neq('status', 'sold')
    .not('public_slug', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

  const urls = (vehicles ?? [])
    .filter(v => v.public_slug)
    .map(v => `
  <url>
    <loc>${baseUrl}/${slug}/inventory/${v.public_slug}</loc>
    <lastmod>${new Date(v.created_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`)
    .join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/${slug}/inventory</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
