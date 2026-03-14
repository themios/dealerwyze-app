import type { MetadataRoute } from 'next'
import { getAllPosts } from '@/lib/blog'

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts()
  const blogEntries: MetadataRoute.Sitemap = posts.map(p => ({
    url: `https://dealerwyze.com/blog/${p.slug}`,
    lastModified: p.date ? new Date(p.date) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  return [
    { url: 'https://dealerwyze.com/blog', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    ...blogEntries,
    {
      url: 'https://dealerwyze.com',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://dealerwyze.com/signup',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://dealerwyze.com/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]
}
