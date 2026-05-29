'use client'

import { useState } from 'react'
import { X, Loader2, Search, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import HelpSearch from './HelpSearch'
import HelpArticleList from './HelpArticleList'
import { useVertical } from '@/hooks/useVertical'

interface Article {
  id: number
  slug: string
  question: string
  answer: string
  related_links?: { label: string; page: string }[]
}

interface HelpPanelProps {
  isOpen: boolean
  onClose: () => void
  currentPage?: string
}

/**
 * HelpPanel - Side panel that slides in from the right.
 * Contains search box, article list, and AI ask feature with toggle.
 * Filters by vertical automatically.
 */
export default function HelpPanel({ isOpen, onClose, currentPage }: HelpPanelProps) {
  const { brandName } = useVertical()
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [activeTab, setActiveTab] = useState<'search' | 'ask'>('search')
  const [askQuestion, setAskQuestion] = useState('')
  const [askResponse, setAskResponse] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askError, setAskError] = useState('')

  const handleAsk = async () => {
    if (!askQuestion.trim()) return

    setIsAsking(true)
    setAskError('')
    setAskResponse('')

    try {
      const response = await fetch('/api/help/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: askQuestion,
          currentPage: currentPage || '/',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        setAskError(error.error || 'Failed to get answer')
        return
      }

      const data = await response.json()
      setAskResponse(data.answer || '')
    } catch (err) {
      console.error('Ask error:', err)
      setAskError('Could not get an answer. Try searching articles instead.')
    } finally {
      setIsAsking(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full max-w-md bg-background border-l shadow-lg z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-foreground">{brandName} Help</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            aria-label="Close help panel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs */}
        {!selectedArticle && (
          <div className="flex gap-2 p-4 border-b">
            <Button
              variant={activeTab === 'search' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('search')}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search
            </Button>
            <Button
              variant={activeTab === 'ask' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('ask')}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-4 h-4" />
              Ask AI
            </Button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedArticle ? (
            <>
              {activeTab === 'search' && (
                <HelpSearch currentPage={currentPage} onSelectArticle={setSelectedArticle} />
              )}

              {activeTab === 'ask' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your question</label>
                    <textarea
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      placeholder="Ask anything about using this feature..."
                      className="w-full h-20 px-3 py-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <Button
                    onClick={handleAsk}
                    disabled={!askQuestion.trim() || isAsking}
                    className="w-full"
                  >
                    {isAsking ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Getting answer...
                      </>
                    ) : (
                      'Get Answer'
                    )}
                  </Button>

                  {askError && (
                    <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {askError}
                    </div>
                  )}

                  {askResponse && (
                    <div className="text-sm bg-accent p-3 rounded space-y-2">
                      <p className="font-medium text-foreground">Answer:</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{askResponse}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <HelpArticleList article={selectedArticle} onBack={() => setSelectedArticle(null)} />
          )}
        </div>
      </div>
    </>
  )
}
