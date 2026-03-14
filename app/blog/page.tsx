import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllPosts } from '@/lib/blog'

export const metadata: Metadata = {
  title: 'Blog - DealerWyze | Tips for Independent Used Car Dealers',
  description:
    'Practical advice for independent and used car dealers: lead response, CRM tips, inventory management, BHPH, and more.',
  alternates: { canonical: 'https://dealerwyze.com/blog' },
  robots: { index: true, follow: true },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function BlogIndex() {
  const posts = getAllPosts()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-[#0D2B55] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">DealerWyze</Link>
          <Link
            href="/signup"
            className="text-sm bg-[#F07018] hover:bg-[#d9631a] text-white px-4 py-2 rounded-md font-medium transition-colors"
          >
            Start free
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-foreground mb-2">The DealerWyze Blog</h1>
        <p className="text-muted-foreground mb-10 text-base">
          Practical tips for independent and used car dealers - lead response, follow-up, inventory, and more.
        </p>

        {posts.length === 0 ? (
          <p className="text-muted-foreground">No posts yet.</p>
        ) : (
          <div className="space-y-px">
            {posts.map(post => (
              <article
                key={post.slug}
                className="group py-6 border-b border-border last:border-0"
              >
                <Link href={`/blog/${post.slug}`} className="block">
                  <h2 className="text-xl font-semibold text-foreground group-hover:text-[#F07018] transition-colors leading-snug mb-1">
                    {post.title}
                  </h2>
                  {post.description && (
                    <p className="text-muted-foreground text-sm mb-2 line-clamp-2">
                      {post.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {post.date && <span>{formatDate(post.date)}</span>}
                    {post.readTime && (
                      <>
                        <span>·</span>
                        <span>{post.readTime} min read</span>
                      </>
                    )}
                    {(post.tags ?? []).length > 0 && (
                      <>
                        <span>·</span>
                        <span>{post.tags!.join(', ')}</span>
                      </>
                    )}
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* CTA footer */}
      <div className="border-t border-border bg-muted/30 py-12 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-lg font-semibold mb-1">Ready to reply faster and close more deals?</p>
          <p className="text-muted-foreground text-sm mb-4">DealerWyze is free to start. No credit card required.</p>
          <Link
            href="/signup"
            className="inline-block bg-[#F07018] hover:bg-[#d9631a] text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Start free
          </Link>
        </div>
      </div>
    </div>
  )
}
