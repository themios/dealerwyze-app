import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getBaseUrlForHost } from '@/lib/dealer-public/site'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? ''
  const base = getBaseUrlForHost(host).replace(/\/$/, '')
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${base}/sitemap.xml`,
  }
}
