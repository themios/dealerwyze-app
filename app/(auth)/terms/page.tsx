'use client'

import { useEffect, useState } from 'react'
import { getVerticalFromHost } from '@/lib/vertical/getVerticalFromHost'
import Link from 'next/link'
import DOMPurify from 'isomorphic-dompurify'

export default function TermsPage() {
  const [htmlContent, setHtmlContent] = useState<string>('')
  const [vertical, setVertical] = useState<'dealer' | 'real_estate'>('dealer')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchContent = async () => {
      try {
        // Get vertical from host
        const config = await getVerticalFromHost()
        setVertical(config.vertical)

        // Fetch the appropriate HTML file
        const filename = config.vertical === 'real_estate' ? 'realtywyze-terms.html' : 'terms.html'
        const response = await fetch(`/${filename}`)
        const html = await response.text()

        // Extract body content from HTML
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        const bodyContent = bodyMatch ? bodyMatch[1] : html

        // Sanitize the HTML
        const cleanHtml = DOMPurify.sanitize(bodyContent, {
          ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'br', 'hr', 'blockquote', 'span'],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
        })

        setHtmlContent(cleanHtml)
      } catch (error) {
        console.error('Failed to load terms:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchContent()
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Loading Terms of Service...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-primary hover:text-primary/80 transition-colors">
              ← Back
            </Link>
            <h1 className="text-xl font-semibold text-foreground">
              {vertical === 'real_estate' ? 'RealtyWyze' : 'DealerWyze'} — Terms of Service
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <style>{`
              .prose {
                --tw-prose-body: var(--foreground);
                --tw-prose-headings: var(--foreground);
                --tw-prose-links: var(--primary);
                --tw-prose-strong: var(--foreground);
              }

              .prose h1 { font-size: 2em; font-weight: 700; margin-top: 0; margin-bottom: 0.5em; }
              .prose h2 { font-size: 1.5em; font-weight: 600; margin-top: 1.5em; margin-bottom: 0.5em; }
              .prose h3 { font-size: 1.25em; font-weight: 600; margin-top: 1.25em; margin-bottom: 0.5em; }
              .prose p { margin-bottom: 1em; line-height: 1.75; }
              .prose a { color: hsl(var(--primary)); text-decoration: none; }
              .prose a:hover { text-decoration: underline; }
              .prose strong { font-weight: 600; }
              .prose ul, .prose ol { margin-left: 1.5em; margin-bottom: 1em; }
              .prose li { margin-bottom: 0.5em; }
              .prose hr { margin: 2em 0; border: none; border-top: 1px solid hsl(var(--border)); }
              .prose blockquote { margin-left: 1.5em; padding-left: 1em; border-left: 3px solid hsl(var(--border)); color: hsl(var(--muted-foreground)); font-style: italic; }
              .updated { color: hsl(var(--muted-foreground)); font-size: 0.9em; margin-bottom: 2em; }
              .caps { text-transform: uppercase; }
            `}</style>
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </article>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border bg-card/50 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="font-semibold text-foreground mb-2">Legal</p>
              <ul className="space-y-2">
                <li>
                  <Link href="/terms" className="text-primary hover:text-primary/80 transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-primary hover:text-primary/80 transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-2">Company</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  {vertical === 'real_estate' ? (
                    <>
                      <span>KMA Auto Inc</span>
                      <br />
                      <span className="text-xs">California Corporation</span>
                    </>
                  ) : (
                    <>
                      <span>KMA Auto Inc</span>
                      <br />
                      <span className="text-xs">California Corporation</span>
                    </>
                  )}
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-2">Contact</p>
              <ul className="space-y-2 text-muted-foreground text-xs">
                <li>
                  <a href={`mailto:${vertical === 'real_estate' ? 'legal@realtywyze.us' : 'legal@dealerwyze.com'}`} className="text-primary hover:text-primary/80 transition-colors">
                    Legal
                  </a>
                </li>
                <li>
                  <a href={`mailto:${vertical === 'real_estate' ? 'privacy@realtywyze.us' : 'privacy@dealerwyze.com'}`} className="text-primary hover:text-primary/80 transition-colors">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href={`mailto:${vertical === 'real_estate' ? 'support@realtywyze.us' : 'support@dealerwyze.com'}`} className="text-primary hover:text-primary/80 transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-xs text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} {vertical === 'real_estate' ? 'RealtyWyze' : 'DealerWyze'}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
