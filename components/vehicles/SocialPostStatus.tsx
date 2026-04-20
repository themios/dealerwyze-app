'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react'

interface SocialPost {
  id: string
  platform: string
  status: 'pending' | 'posting' | 'posted' | 'failed' | 'skipped'
  platform_post_url: string | null
  posted_at: string | null
  error_message: string | null
}

interface SocialPostStatusProps {
  vehicleId: string
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook:  'Facebook',
  instagram: 'Instagram',
  tiktok:    'TikTok',
  youtube:   'YouTube',
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  'text-blue-600',
  instagram: 'text-pink-600',
  tiktok:    'text-slate-800 dark:text-slate-200',
  youtube:   'text-red-600',
}

export default function SocialPostStatus({ vehicleId }: SocialPostStatusProps) {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`/api/vehicles/${vehicleId}/video`)
        if (!res.ok) return
        const data = await res.json() as { posts: SocialPost[] }
        if (active) setPosts(data.posts ?? [])
      } catch {
        // Ignore
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [vehicleId])

  if (loading || posts.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Social Posts</p>
      <div className="space-y-1.5">
        {posts.map(post => (
          <div key={post.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {post.status === 'posted'  && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
              {post.status === 'failed'  && <XCircle      className="h-4 w-4 text-red-500   flex-shrink-0" />}
              {(post.status === 'pending' || post.status === 'posting') && (
                <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
              )}
              <span className={`font-medium ${PLATFORM_COLORS[post.platform] ?? ''}`}>
                {PLATFORM_LABELS[post.platform] ?? post.platform}
              </span>
              {post.posted_at && (
                <span className="text-xs text-muted-foreground">
                  {new Date(post.posted_at).toLocaleDateString()}
                </span>
              )}
              {post.status === 'failed' && post.error_message && (
                <span className="text-xs text-red-500 truncate max-w-[120px]">
                  {post.error_message}
                </span>
              )}
            </div>
            {post.platform_post_url && (
              <a
                href={post.platform_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                View
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
