'use client'

import { useState, useRef } from 'react'
import { X, Loader2, Search, MessageCircle, MessageSquarePlus, Send, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Image from 'next/image'
import HelpSearch from './HelpSearch'
import HelpArticleList from './HelpArticleList'
import { useVertical } from '@/hooks/useVertical'

type FeedbackType = 'bug' | 'suggestion' | 'question' | 'compliment'
const MAX_IMAGES = 5
const MAX_FILE_MB = 5

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
  const [activeTab, setActiveTab] = useState<'search' | 'ask' | 'feedback'>('search')
  const [askQuestion, setAskQuestion] = useState('')
  const [askResponse, setAskResponse] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const [askError, setAskError] = useState('')

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('suggestion')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackFiles, setFeedbackFiles] = useState<{ file: File; url: string }[]>([])
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const addFeedbackFiles = (newFiles: FileList | null) => {
    if (!newFiles?.length) return
    const allowed = Array.from(newFiles).filter(
      (f) => f.type.startsWith('image/') && f.size <= MAX_FILE_MB * 1024 * 1024
    )
    setFeedbackFiles((prev) => {
      const next = [...prev, ...allowed.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, MAX_IMAGES)
      return next
    })
  }

  const removeFeedbackFile = (index: number) => {
    setFeedbackFiles((prev) => {
      const entry = prev[index]
      if (entry) URL.revokeObjectURL(entry.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedbackMessage.trim()) return
    setSendingFeedback(true)
    try {
      const formData = new FormData()
      formData.set('type', feedbackType)
      formData.set('message', feedbackMessage)
      feedbackFiles.forEach(({ file }) => formData.append('attachments', file))
      const res = await fetch('/api/feedback', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Failed to send feedback.')
        return
      }
      setFeedbackSent(true)
      setTimeout(() => {
        setFeedbackMessage('')
        setFeedbackType('suggestion')
        setFeedbackFiles((prev) => {
          prev.forEach(({ url }) => URL.revokeObjectURL(url))
          return []
        })
        setFeedbackSent(false)
        setActiveTab('search')
      }, 2000)
    } finally {
      setSendingFeedback(false)
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
          <div className="flex gap-1 p-4 border-b overflow-x-auto">
            <Button
              variant={activeTab === 'search' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('search')}
              className="flex items-center justify-center gap-1 whitespace-nowrap text-xs"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </Button>
            <Button
              variant={activeTab === 'ask' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('ask')}
              className="flex items-center justify-center gap-1 whitespace-nowrap text-xs"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Ask</span>
            </Button>
            <Button
              variant={activeTab === 'feedback' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('feedback')}
              className="flex items-center justify-center gap-1 whitespace-nowrap text-xs"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Feedback</span>
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

              {activeTab === 'feedback' && (
                <div className="space-y-3">
                  {feedbackSent ? (
                    <div className="text-center py-6">
                      <div className="text-4xl mb-2">🙏</div>
                      <p className="font-semibold text-foreground">Thank you!</p>
                      <p className="text-xs text-muted-foreground mt-1">Your feedback helps shape {brandName}.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitFeedback} className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Type</Label>
                        <Select value={feedbackType} onValueChange={(v) => setFeedbackType(v as FeedbackType)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bug">🐛 Bug</SelectItem>
                            <SelectItem value="suggestion">💡 Suggestion</SelectItem>
                            <SelectItem value="question">❓ Question</SelectItem>
                            <SelectItem value="compliment">⭐ Compliment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">
                          {feedbackType === 'bug' ? 'Describe the bug' : 'Your message'}
                        </Label>
                        <textarea
                          value={feedbackMessage}
                          onChange={(e) => setFeedbackMessage(e.target.value)}
                          placeholder={feedbackType === 'bug' ? 'What happened vs what you expected...' : 'Tell us...'}
                          rows={4}
                          className="w-full px-2 py-1.5 text-xs border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Images (optional)</Label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          multiple
                          className="hidden"
                          onChange={(e) => { addFeedbackFiles(e.target.files); e.target.value = '' }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={feedbackFiles.length >= MAX_IMAGES}
                          className="h-8 text-xs"
                        >
                          <ImagePlus className="w-3 h-3 mr-1" />
                          Add ({feedbackFiles.length}/{MAX_IMAGES})
                        </Button>
                        {feedbackFiles.length > 0 && (
                          <ul className="flex flex-wrap gap-2">
                            {feedbackFiles.map(({ url }, i) => (
                              <li key={i} className="relative w-12 h-12 rounded border overflow-hidden bg-gray-50 flex-shrink-0">
                                <Image src={url} alt="" fill unoptimized className="object-cover" sizes="48px" />
                                <button
                                  type="button"
                                  onClick={() => removeFeedbackFile(i)}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white text-xs"
                                  aria-label="Remove"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button type="button" variant="outline" onClick={() => { setActiveTab('search'); setFeedbackMessage(''); setFeedbackType('suggestion'); }} className="flex-1 h-8 text-xs">
                          Cancel
                        </Button>
                        <Button type="submit" disabled={sendingFeedback || !feedbackMessage.trim()} className="flex-1 h-8 text-xs">
                          {sendingFeedback ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending</> : <><Send className="w-3 h-3 mr-1" /> Send</>}
                        </Button>
                      </div>
                    </form>
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
