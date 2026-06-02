'use client'

import { useState } from 'react'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface RelatedLink {
  label: string
  page: string
}

interface Article {
  id: number
  slug: string
  question: string
  answer: string
  related_links?: RelatedLink[]
}

interface HelpArticleListProps {
  article: Article
  onBack: () => void
}

/**
 * HelpArticleList - Display a selected article with "Go to [Feature]" buttons.
 * Shows markdown answer, related links, and back button.
 */
export default function HelpArticleList({ article, onBack }: HelpArticleListProps) {
  const router = useRouter()
  const [expandedLinks, setExpandedLinks] = useState(false)

  // Simple markdown to HTML (bold, italic, links)
  const formatAnswer = (text: string) => {
    return text
      .split('\n\n')
      .map((para, idx) => {
        const formatted = para
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-primary underline">$1</a>')
        return (
          <p key={idx} className="mb-3 last:mb-0 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
        )
      })
  }

  const relatedLinks = (article.related_links as RelatedLink[] | undefined) || []

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to search
      </button>

      <div>
        <h3 className="text-base font-semibold mb-3 text-foreground">{article.question}</h3>
        <div className="text-sm leading-relaxed text-muted-foreground prose prose-sm max-w-none dark:prose-invert">
          {formatAnswer(article.answer)}
        </div>
      </div>

      {relatedLinks.length > 0 && (
        <div className="pt-2 border-t">
          <button
            onClick={() => setExpandedLinks(!expandedLinks)}
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${expandedLinks ? 'rotate-90' : ''}`} />
            Related features
          </button>

          {expandedLinks && (
            <div className="space-y-2 mt-2">
              {relatedLinks.map((link, idx) => (
                <Button
                  key={idx}
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(link.page)}
                  className="w-full justify-between text-left h-auto py-2 px-3 hover:bg-accent"
                >
                  <span>{link.label}</span>
                  <ExternalLink className="w-3 h-3" />
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
