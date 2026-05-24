'use client'

import Image from 'next/image'
import { useState, useRef } from 'react'
import { MessageSquarePlus, X, Send, Loader2, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useVertical } from '@/hooks/useVertical'

type FeedbackType = 'bug' | 'suggestion' | 'question' | 'compliment'

const MAX_IMAGES = 5
const MAX_FILE_MB = 5

export default function FeedbackButton() {
  const { brandName } = useVertical()
  const [open, setOpen]       = useState(false)
  const [type, setType]       = useState<FeedbackType>('suggestion')
  const [message, setMessage] = useState('')
  const [files, setFiles]     = useState<{ file: File; url: string }[]>([])
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const fileInputRef          = useRef<HTMLInputElement>(null)

  function addFiles(newFiles: FileList | null) {
    if (!newFiles?.length) return
    const allowed = Array.from(newFiles).filter(
      (f) => f.type.startsWith('image/') && f.size <= MAX_FILE_MB * 1024 * 1024
    )
    setFiles((prev) => {
      const next = [...prev, ...allowed.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, MAX_IMAGES)
      return next
    })
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const entry = prev[index]
      if (entry) URL.revokeObjectURL(entry.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    try {
      const formData = new FormData()
      formData.set('type', type)
      formData.set('message', message)
      files.forEach(({ file }) => formData.append('attachments', file))
      const res = await fetch('/api/feedback', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Failed to send feedback.')
        return
      }
      setSent(true)
      setTimeout(() => {
        setOpen(false)
        setSent(false)
        setMessage('')
        setType('suggestion')
        setFiles((prev) => {
          prev.forEach(({ url }) => URL.revokeObjectURL(url))
          return []
        })
      }, 2000)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating trigger: compact icon by default, expands to pill on hover so it doesn't cover + task FAB */}
      <button
        onClick={() => setOpen(true)}
        className="group fixed bottom-28 right-4 z-40 lg:bottom-6 lg:right-6 flex items-center justify-center gap-2 w-10 h-10 rounded-full shadow-lg font-semibold text-sm text-white transition-all duration-200 hover:opacity-90 active:scale-95 overflow-hidden lg:justify-center lg:hover:w-auto lg:hover:px-4 lg:hover:gap-2"
        style={{ backgroundColor: '#0D2B55', boxShadow: '0 4px 16px rgba(13,43,85,0.35)' }}
        aria-label="Send feedback">
        <MessageSquarePlus className="w-4 h-4 shrink-0" />
        <span className="max-w-0 overflow-hidden opacity-0 lg:group-hover:max-w-[100px] lg:group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">Feedback</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ backgroundColor: '#fff' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black" style={{ color: '#0D2B55' }}>
                Share Your Feedback
              </h2>
              <button onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {sent ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🙏</div>
                <p className="font-bold text-lg" style={{ color: '#0D2B55' }}>Thank you!</p>
                <p className="text-sm text-muted-foreground mt-1">Your feedback helps shape {brandName}.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="feedback-type" className="text-sm font-semibold">Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
                    <SelectTrigger id="feedback-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">🐛 Bug report</SelectItem>
                      <SelectItem value="suggestion">💡 Suggestion / improvement</SelectItem>
                      <SelectItem value="question">❓ Question</SelectItem>
                      <SelectItem value="compliment">⭐ Compliment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="feedback-message" className="text-sm font-semibold">
                    {type === 'bug' ? 'Describe the bug — what happened vs. what you expected' : 'Your message'}
                  </Label>
                  <Textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      type === 'bug'
                        ? 'Steps to reproduce: 1. I went to... 2. I clicked... 3. Expected X but got Y'
                        : 'Tell us what you think...'
                    }
                    rows={5}
                    className="resize-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Attach images (optional)</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={files.length >= MAX_IMAGES}
                    >
                      <ImagePlus className="w-4 h-4 mr-1.5" />
                      Add image{files.length >= MAX_IMAGES ? '' : ` (${files.length}/${MAX_IMAGES})`}
                    </Button>
                    {files.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Max {MAX_FILE_MB}MB each • JPEG, PNG, GIF, WebP
                      </span>
                    )}
                  </div>
                  {files.length > 0 && (
                    <ul className="flex flex-wrap gap-2 mt-2">
                      {files.map(({ url }, i) => (
                        <li
                          key={i}
                          className="relative w-14 h-14 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0"
                        >
                          <Image src={url} alt="" fill unoptimized className="object-cover" sizes="56px" />
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="absolute top-0.5 right-0.5 p-1 rounded bg-black/50 text-white hover:bg-black/70"
                            aria-label="Remove image"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={sending || !message.trim()} className="flex-1">
                    {sending
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                      : <><Send className="w-4 h-4 mr-2" /> Send</>}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
