'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Pencil, ChevronDown, ChevronUp, Loader2, Video, CalendarClock, X, Archive, Trash2, Play } from 'lucide-react'

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
  platform_targets: string[]
  platform_captions: Record<string, string>
  render_id: string | null
  scheduled_at: string | null
  created_at: string
}

interface DraftCardProps {
  draft: Draft
  onApprove:  (id: string) => Promise<void>
  onReject:   (id: string) => Promise<void>
  onEdit:     (draft: Draft) => void
  onSchedule: (id: string, scheduledAt: string | null) => Promise<void>
  onArchive:  (id: string) => Promise<void>
  onDelete:   (id: string) => Promise<void>
}

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const THEME_LABELS: Record<string, string> = {
  lead_management:    'Lead Management',
  staff_accountability: 'Staff Accountability',
  closing_deals:      'Closing Deals',
  industry_insights:  'Industry Insights',
  platform_spotlight: 'Platform Spotlight',
  car_buying_basics:  'Car Buying Basics',
  credit_financing:   'Credit & Financing',
  vehicle_spotlight:  'Vehicle Spotlight',
  trust_builders:     'Trust Builders',
  local_community:    'Local Community',
}

export default function DraftCard({ draft, onApprove, onReject, onEdit, onSchedule, onArchive, onDelete }: DraftCardProps) {
  const [expanded, setExpanded]       = useState(false)
  const [loading, setLoading]         = useState<'approve' | 'reject' | 'schedule' | 'archive' | 'delete' | 'render' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showScheduler, setShowScheduler] = useState(false)
  const [localRenderId, setLocalRenderId] = useState<string | null>(draft.render_id)
  const [playUrl, setPlayUrl]             = useState<string | null>(null)
  const [loadingPlay, setLoadingPlay]     = useState(false)
  const [scheduledValue, setScheduledValue] = useState<string>(
    draft.scheduled_at ? toLocalDatetimeInput(draft.scheduled_at) : ''
  )

  const isPending  = draft.status === 'pending'
  const isApproved = draft.status === 'approved' || draft.status === 'rendered'

  async function handleApprove() {
    setLoading('approve')
    await onApprove(draft.id)
    setLoading(null)
  }

  async function handleRender() {
    setLoading('render')
    const res = await fetch(`/api/content/drafts/${draft.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    if (res.ok) {
      const data = await res.json() as { renderId?: string }
      if (data.renderId) setLocalRenderId(data.renderId)
    }
    setLoading(null)
  }

  async function handleReject() {
    setLoading('reject')
    await onReject(draft.id)
    setLoading(null)
  }

  async function handleSaveSchedule() {
    setLoading('schedule')
    const iso = scheduledValue ? new Date(scheduledValue).toISOString() : null
    await onSchedule(draft.id, iso)
    setLoading(null)
    setShowScheduler(false)
  }

  async function handleClearSchedule() {
    setLoading('schedule')
    setScheduledValue('')
    await onSchedule(draft.id, null)
    setLoading(null)
  }

  async function handleArchive() {
    setLoading('archive')
    await onArchive(draft.id)
    setLoading(null)
  }

  async function handleDelete() {
    setLoading('delete')
    await onDelete(draft.id)
    setLoading(null)
  }

  async function handlePlay() {
    if (!localRenderId) return
    setLoadingPlay(true)
    const res = await fetch(`/api/content/render?id=${localRenderId}`)
    if (res.ok) {
      const { render } = await res.json() as { render: { output_url?: string } }
      if (render?.output_url) setPlayUrl(render.output_url)
    }
    setLoadingPlay(false)
  }

  const statusColors: Record<string, string> = {
    pending:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    approved: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    rendered: 'bg-green-500/15 text-green-400 border-green-500/30',
    rejected: 'bg-red-500/15 text-red-400 border-red-500/30',
    archived: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }

  const isArchived = draft.status === 'archived'

  return (
    <>
    <div className="bg-[#0d1f3c] border border-[#1B4A8A]/40 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {draft.content_theme && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#1B4A8A]/40 text-blue-300 border border-[#1B4A8A]/50">
                  {THEME_LABELS[draft.content_theme] ?? draft.content_theme}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${statusColors[draft.status]}`}>
                {draft.status}
              </span>
            </div>
            <h3 className="text-white font-semibold text-base leading-snug">{draft.topic}</h3>
            {draft.tagline && (
              <p className="text-blue-300/70 text-sm mt-0.5">{draft.tagline}</p>
            )}
            {draft.platform_captions?.instagram && (
              <p className="text-slate-400 text-xs mt-1.5 italic leading-relaxed">
                {draft.platform_captions.instagram.length > 100
                  ? draft.platform_captions.instagram.slice(0, 100) + '…'
                  : draft.platform_captions.instagram}
              </p>
            )}
            {draft.platform_targets?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {draft.platform_targets.slice(0, 4).map(p => (
                  <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/40 uppercase tracking-wide">
                    {p}
                  </span>
                ))}
                {draft.platform_targets.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/40">
                    +{draft.platform_targets.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Schedule badge */}
        {draft.scheduled_at && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-300/80">
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span>{new Date(draft.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <button
              onClick={handleClearSchedule}
              disabled={!!loading}
              className="ml-auto text-white/30 hover:text-white/60 transition-colors disabled:opacity-30"
              title="Clear schedule"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Slide preview */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-blue-400/70 hover:text-blue-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {draft.slides.length} slides
        </button>

        {expanded && (
          <div className="mt-3 space-y-2">
            {draft.slides.map((s, i) => (
              <div key={i} className="bg-[#0a1628] rounded-lg px-3 py-2 border border-[#1B4A8A]/20">
                <p className="text-white text-sm font-medium">
                  {s.emoji && <span className="mr-1.5">{s.emoji}</span>}
                  {s.headline}
                </p>
                {s.body && <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{s.body}</p>}
              </div>
            ))}
            <div className="bg-[#0a1628] rounded-lg px-3 py-2 border border-orange-500/20">
              <p className="text-orange-300/80 text-xs">CTA: {draft.cta_text}</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isPending && (
            <>
              <button
                onClick={handleApprove}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading === 'approve'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle className="w-4 h-4" />}
                Approve
              </button>
              <button
                onClick={() => onEdit(draft)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4A8A]/50 hover:bg-[#1B4A8A]/80 text-white text-sm transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={handleReject}
                disabled={!!loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm transition-colors disabled:opacity-50"
              >
                {loading === 'reject'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <XCircle className="w-4 h-4" />}
                Reject
              </button>
            </>
          )}
          {draft.status === 'rendered' && localRenderId && (
            <button
              onClick={handlePlay}
              disabled={loadingPlay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-700/40 hover:bg-green-700/70 text-green-300 text-sm transition-colors disabled:opacity-50"
            >
              {loadingPlay ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-green-300" />}
              Preview
            </button>
          )}
          {draft.status === 'approved' && localRenderId && (
            <span className="flex items-center gap-1.5 text-sm text-green-400/80">
              <Video className="w-4 h-4" />
              Render queued
            </span>
          )}
          {isApproved && !localRenderId && draft.status === 'approved' && (
            <button
              onClick={handleRender}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-900/30 hover:bg-green-900/50 text-green-400 text-sm transition-colors disabled:opacity-50"
            >
              {loading === 'render' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
              Render
            </button>
          )}
          {isApproved && (
            <button
              onClick={handleArchive}
              disabled={!!loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-700/70 text-slate-300 text-sm transition-colors disabled:opacity-50"
            >
              {loading === 'archive' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
              Archive
            </button>
          )}

          {/* Schedule toggle — hidden on archived cards */}
          {!isArchived && (
            <button
              onClick={() => setShowScheduler(v => !v)}
              className={`ml-auto flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                showScheduler || draft.scheduled_at
                  ? 'text-purple-300 bg-purple-900/30 hover:bg-purple-900/50'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
              title="Schedule post"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              {!draft.scheduled_at && 'Schedule'}
            </button>
          )}

          {/* Delete */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={!!loading}
              className={`${isArchived ? '' : 'ml-auto '}flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-white/30 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-30`}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs text-red-400/80">Delete?</span>
              <button
                onClick={handleDelete}
                disabled={!!loading}
                className="px-2 py-1 rounded text-xs bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {loading === 'delete' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 rounded text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                No
              </button>
            </div>
          )}
        </div>

        {/* Inline scheduler */}
        {showScheduler && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="datetime-local"
              value={scheduledValue}
              min={toLocalDatetimeInput(new Date().toISOString())}
              onChange={e => setScheduledValue(e.target.value)}
              className="flex-1 bg-[#0a1628] border border-[#1B4A8A]/40 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-purple-500/60 [color-scheme:dark]"
            />
            <button
              onClick={handleSaveSchedule}
              disabled={!scheduledValue || !!loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
            >
              {loading === 'schedule' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
            <button
              onClick={() => setShowScheduler(false)}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>

    {/* Video preview modal */}
    {playUrl && (
      <div
        className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        onClick={() => setPlayUrl(null)}
      >
        <div
          className="relative w-full max-w-sm"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => setPlayUrl(null)}
            className="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <X className="w-4 h-4" /> Close
          </button>
          <video
            src={playUrl}
            controls
            autoPlay
            playsInline
            className="w-full rounded-2xl shadow-2xl"
            style={{ maxHeight: '80dvh' }}
          />
          <p className="mt-3 text-center text-white/50 text-xs truncate">{draft.topic}</p>
        </div>
      </div>
    )}
    </>
  )
}
