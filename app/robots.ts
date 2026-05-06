import type { MetadataRoute } from 'next'
import { getPublicAppBaseUrl } from '@/lib/dealer-public/site'

export default function robots(): MetadataRoute.Robots {
  const base = getPublicAppBaseUrl().replace(/\/$/, '')
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${base}/sitemap.xml`,
  }
}
