'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useVertical } from '@/hooks/useVertical'

interface SearchResult {
  id: number
  slug: string
  question: string
  answer: string
  keywords: string[]
}

interface HelpSearchProps {
  currentPage?: string
  onSelectArticle: (article: SearchResult) => void
}

/**
 * HelpSearch - Search input with real-time keyword matching.
 * Calls /api/help/articles with query, filters by vertical.
 */
export default function HelpSearch({ currentPage, onSelectArticle }: HelpSearchProps) {
  const { vertical } = useVertical()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([])
        setError('')
        return
      }

      setIsSearching(true)
      setError('')
      try {
        const params = new URLSearchParams()
        params.set('query', query)
        params.set('vertical', vertical)
        if (currentPage) params.set('context_page', currentPage)

        const response = await fetch(`/api/help/articles?${params}`)
        if (!response.ok) throw new Error('Search failed')

        const data = await response.json()
        setResults(data.articles || [])
      } catch (err) {
        console.error('Search error:', err)
        setError('Search failed. Try again.')
      } finally {
        setIsSearching(false)
      }
    }, 300) // Debounce 300ms

    return () => clearTimeout(timer)
  }, [query, vertical, currentPage])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search help..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive p-2 bg-destructive/10 rounded">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {results.map((article) => (
            <button
              key={article.id}
              onClick={() => onSelectArticle(article)}
              className="w-full text-left p-2 rounded hover:bg-accent text-sm transition-colors"
            >
              <p className="font-medium text-foreground line-clamp-2">{article.question}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{article.answer}</p>
            </button>
          ))}
        </div>
      )}

      {query.trim() && results.length === 0 && !isSearching && (
        <div className="text-center py-4 text-sm text-muted-foreground">No articles found. Try different keywords.</div>
      )}
    </div>
  )
}
