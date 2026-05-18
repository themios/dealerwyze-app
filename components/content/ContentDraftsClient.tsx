'use client'

import { useState, useCallback } from 'react'
import { Loader2, Sparkles, RefreshCw } from 'lucide-react'
import DraftCard from './DraftCard'

interface Slide {
  headline: string
  body?: string
  emoji?: string
}

interface Draft {
  id: string
  status: 'pending' | 'approved' | 'rejected' | 'rendered' | 'archived'
  topic: string
  tagline: string | null
  slides: Slide[]
  cta_text: string
  content_theme: string | null
  render_id: string | null
  scheduled_at: string | null
  created_at: string
}

type Tab = 'pending' | 'approved' | 'rejected' | 'archived'

interface EditState {
  draft: Draft
  topic: string
  tagline: string
  cta_text: string
  slides: Slide[]
}

export default function ContentDraftsClient({ initialDrafts }: { initialDrafts: Draft[] }) {
  const [drafts, setDrafts]       = useState<Draft[]>(initialDrafts)
  const [tab, setTab]             = useState<Tab>('pending')
  const [generating, setGenerating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving]       = useState(false)

  const visible = drafts.filter(d =>
    tab === 'approved' ? (d.status === 'approved' || d.status === 'rendered') : d.status === tab
  )

  const counts = {
    pending:  drafts.filter(d => d.status === 'pending').length,
    approved: drafts.filter(d => d.status === 'approved' || d.status === 'rendered').length,
    rejected: drafts.filter(d => d.status === 'rejected').length,
    archived: drafts.filter(d => d.status === 'archived').length,
  }

  async function refresh() {
    setRefreshing(true)
    const res = await fetch('/api/content/drafts')
    if (res.ok) {
      const { drafts: fresh } = await res.json() as { drafts: Draft[] }
      setDrafts(fresh)
    }
    setRefreshing(false)
  }

  async function generate() {
    setGenerating(true)
    const res = await fetch('/api/content/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 10 }),
    })
    if (res.ok) {
      const { drafts: newDrafts } = await res.json() as { drafts: Draft[] }
      setDrafts(prev => [...newDrafts, ...prev])
      setTab('pending')
    }
    setGenerating(false)
  }

  const handleApprove = useCallback(async (id: string) => {
    const res = await fetch(`/api/content/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'approved' } : d))
    }
  }, [])

  const handleReject = useCallback(async (id: string) => {
    const res = await fetch(`/api/content/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'rejected' } : d))
    }
  }, [])

  const handleSchedule = useCallback(async (id: string, scheduledAt: string | null) => {
    const res = await fetch(`/api/content/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'schedule', scheduled_at: scheduledAt }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, scheduled_at: scheduledAt } : d))
    }
  }, [])

  const handleArchive = useCallback(async (id: string) => {
    const res = await fetch(`/api/content/drafts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'archived' } : d))
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/content/drafts/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDrafts(prev => prev.filter(d => d.id !== id))
    }
  }, [])

  const handleEdit = useCallback((draft: Draft) => {
    setEditState({
      draft,
      topic:    draft.topic,
      tagline:  draft.tagline ?? '',
      cta_text: draft.cta_text,
      slides:   draft.slides.map(s => ({ ...s })),
    })
  }, [])

  async function saveEdit() {
    if (!editState) return
    setSaving(true)
    const res = await fetch(`/api/content/drafts/${editState.draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:   'edit',
        topic:    editState.topic,
        tagline:  editState.tagline || undefined,
        cta_text: editState.cta_text,
        slides:   editState.slides,
      }),
    })
    if (res.ok) {
      setDrafts(prev => prev.map(d => d.id === editState.draft.id
        ? { ...d, topic: editState.topic, tagline: editState.tagline || null, cta_text: editState.cta_text, slides: editState.slides }
        : d
      ))
      setEditState(null)
    }
    setSaving(false)
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending',  label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'archived', label: 'Archive' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1B4A8A]/30 shrink-0">
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === t.key
                  ? 'bg-[#1B4A8A]/60 text-white'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key ? 'bg-white/20' : 'bg-white/10'
                }`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4A8A] hover:bg-[#2558aa] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate 10
          </button>
        </div>
      </div>

      {/* Draft list */}
      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-white/30">
            <p className="text-sm">No {tab} drafts</p>
            {tab === 'pending' && (
              <button onClick={generate} disabled={generating} className="mt-3 text-blue-400 text-sm hover:text-blue-300">
                Generate a batch
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map(draft => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onApprove={handleApprove}
                onReject={handleReject}
                onEdit={handleEdit}
                onSchedule={handleSchedule}
                onArchive={handleArchive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editState && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0d1f3c] border border-[#1B4A8A]/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#1B4A8A]/30">
              <h2 className="text-white font-semibold text-lg">Edit Draft</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-blue-300/70 mb-1 block">Topic</label>
                <input
                  value={editState.topic}
                  onChange={e => setEditState(s => s ? { ...s, topic: e.target.value } : s)}
                  className="w-full bg-[#0a1628] border border-[#1B4A8A]/40 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#1B4A8A]"
                />
              </div>
              <div>
                <label className="text-xs text-blue-300/70 mb-1 block">Tagline</label>
                <input
                  value={editState.tagline}
                  onChange={e => setEditState(s => s ? { ...s, tagline: e.target.value } : s)}
                  className="w-full bg-[#0a1628] border border-[#1B4A8A]/40 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#1B4A8A]"
                />
              </div>
              <div>
                <label className="text-xs text-blue-300/70 mb-1 block">Slides</label>
                <div className="space-y-2">
                  {editState.slides.map((slide, i) => (
                    <div key={i} className="bg-[#0a1628] border border-[#1B4A8A]/20 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={slide.emoji ?? ''}
                          onChange={e => setEditState(s => {
                            if (!s) return s
                            const slides = [...s.slides]
                            slides[i] = { ...slides[i], emoji: e.target.value }
                            return { ...s, slides }
                          })}
                          placeholder="emoji"
                          className="w-14 bg-[#0d1f3c] border border-[#1B4A8A]/30 rounded px-2 py-1.5 text-white text-sm text-center outline-none"
                        />
                        <input
                          value={slide.headline}
                          onChange={e => setEditState(s => {
                            if (!s) return s
                            const slides = [...s.slides]
                            slides[i] = { ...slides[i], headline: e.target.value }
                            return { ...s, slides }
                          })}
                          className="flex-1 bg-[#0d1f3c] border border-[#1B4A8A]/30 rounded px-2 py-1.5 text-white text-sm outline-none"
                          placeholder="Headline"
                        />
                      </div>
                      <textarea
                        value={slide.body ?? ''}
                        onChange={e => setEditState(s => {
                          if (!s) return s
                          const slides = [...s.slides]
                          slides[i] = { ...slides[i], body: e.target.value }
                          return { ...s, slides }
                        })}
                        rows={2}
                        className="w-full bg-[#0d1f3c] border border-[#1B4A8A]/30 rounded px-2 py-1.5 text-slate-300 text-xs outline-none resize-none"
                        placeholder="Body text"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-blue-300/70 mb-1 block">CTA</label>
                <input
                  value={editState.cta_text}
                  onChange={e => setEditState(s => s ? { ...s, cta_text: e.target.value } : s)}
                  className="w-full bg-[#0a1628] border border-[#1B4A8A]/40 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-[#1B4A8A]"
                />
              </div>
            </div>
            <div className="p-5 border-t border-[#1B4A8A]/30 flex justify-end gap-2">
              <button
                onClick={() => setEditState(null)}
                className="px-4 py-2 rounded-lg text-white/60 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B4A8A] hover:bg-[#2558aa] text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
