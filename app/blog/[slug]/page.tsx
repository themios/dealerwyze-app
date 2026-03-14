import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { marked } from 'marked'
import { getAllPosts, getPost } from '@/lib/blog'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: `${post.title} - DealerWyze`,
    description: post.description,
    alternates: { canonical: `https://dealerwyze.com/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://dealerwyze.com/blog/${slug}`,
      type: 'article',
      publishedTime: post.date,
    },
    robots: { index: true, follow: true },
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const html = await marked(post.content, { gfm: true })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-[#0D2B55] text-white">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold tracking-tight">DealerWyze</Link>
          <nav className="flex items-center gap-4">
            <Link href="/blog" className="text-sm text-white/80 hover:text-white">Blog</Link>
            <Link
              href="/signup"
              className="text-sm bg-[#F07018] hover:bg-[#d9631a] text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground mb-8 inline-block">
          ← All posts
        </Link>

        {/* Post header */}
        <h1 className="text-3xl font-bold leading-tight mb-3 mt-4">{post.title}</h1>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-8">
          {post.date && <span>{formatDate(post.date)}</span>}
          {post.readTime && (
            <>
              <span>·</span>
              <span>{post.readTime} min read</span>
            </>
          )}
        </div>

        {/* Article body */}
        <article
          className="prose prose-sm prose-neutral dark:prose-invert max-w-none
            prose-headings:font-semibold prose-headings:text-foreground
            prose-p:text-foreground/90 prose-p:leading-relaxed
            prose-strong:text-foreground prose-strong:font-semibold
            prose-a:text-[#F07018] prose-a:no-underline hover:prose-a:underline
            prose-li:text-foreground/90"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* Inline CTA */}
        <div className="mt-12 border border-border rounded-xl p-6 bg-muted/30 text-center">
          <p className="font-semibold mb-1">Ready to try DealerWyze?</p>
          <p className="text-sm text-muted-foreground mb-4">
            Free to start. Works with Gmail and any IMAP inbox. No IT required.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-[#F07018] hover:bg-[#d9631a] text-white px-6 py-3 rounded-md font-medium transition-colors"
          >
            Start free - no credit card
          </Link>
        </div>
      </main>

      {/* Footer */}
      <div className="border-t border-border py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <Link href="/blog" className="hover:text-foreground">Blog</Link>
          <Link href="/" className="hover:text-foreground">DealerWyze home</Link>
        </div>
      </div>
    </div>
  )
}
