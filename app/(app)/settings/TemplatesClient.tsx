'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Template, TemplateChannel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Trash2, Plus, Check, X, MessageSquare, Mail, ChevronDown, ChevronRight, Star } from 'lucide-react'

const SUGGESTED_CATEGORIES = [
  'Daily Response',
  'Follow-Up',
  'Test Drive',
  'Appointment',
  'Financing',
  'Negotiation',
  'Trade-In',
  'Pricing',
  'Post-Sale',
  'Sold',
  'Other',
]

interface Props {
  templates: Template[]
  userId: string
  /** When provided, renders only that channel's template group */
  channel?: TemplateChannel
}

type EditState = {
  id: string
  name: string
  subject: string
  body: string
  channel: TemplateChannel
  category: string
  is_favorite: boolean
}

// ─── Individual template card ───────────────────────────────────────────────

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onFavorite,
}: {
  template: Template
  onEdit: (t: Template) => void
  onDelete: (id: string) => void
  onFavorite: (id: string, val: boolean) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="p-3 rounded-lg border bg-background flex gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm leading-snug">{template.name}</p>
        {template.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 italic">{template.subject}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{template.body}</p>
      </div>
      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
        <button
          onClick={() => onFavorite(template.id, !template.is_favorite)}
          className={`p-1 transition-colors ${template.is_favorite ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-400'}`}
          title={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className="h-3.5 w-3.5" fill={template.is_favorite ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => onEdit(template)}
          className="text-muted-foreground hover:text-foreground p-1"
          title="Edit template"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {confirmDelete ? (
          <div className="flex flex-col items-center gap-0.5">
            <button onClick={() => { onDelete(template.id); setConfirmDelete(false) }} className="text-destructive text-[10px] font-medium px-1">
              Del
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-muted-foreground p-0.5">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-muted-foreground hover:text-destructive p-1"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Edit / New form ─────────────────────────────────────────────────────────

function TemplateForm({
  editing,
  channel,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  editing: EditState
  channel: TemplateChannel
  saving: boolean
  onChange: (e: EditState) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = editing.id.startsWith('new-')
  return (
    <div className={`p-3 rounded-lg border ${isNew ? 'border-dashed' : ''} bg-background space-y-2`}>
      <Input
        placeholder="Template name"
        value={editing.name}
        onChange={e => onChange({ ...editing, name: e.target.value })}
        autoFocus={isNew}
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Category (e.g. Follow-Up)"
            value={editing.category}
            onChange={e => onChange({ ...editing, category: e.target.value })}
            list="template-category-suggestions"
          />
          <datalist id="template-category-suggestions">
            {SUGGESTED_CATEGORIES.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <button
          onClick={() => onChange({ ...editing, is_favorite: !editing.is_favorite })}
          className={`px-2 rounded-md border transition-colors flex-shrink-0 ${editing.is_favorite ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 text-yellow-500' : 'border-border text-muted-foreground hover:text-yellow-400'}`}
          title="Favorite"
        >
          <Star className="h-4 w-4" fill={editing.is_favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      {channel === 'email' && (
        <Input
          placeholder="Email subject"
          value={editing.subject}
          onChange={e => onChange({ ...editing, subject: e.target.value })}
        />
      )}
      <Textarea
        placeholder="Message body"
        value={editing.body}
        onChange={e => onChange({ ...editing, body: e.target.value })}
        className="resize-none text-sm font-mono"
        rows={5}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
          <X className="h-3.5 w-3.5" />Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving || !editing.name || !editing.body} className="gap-1">
          <Check className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

// ─── Per-channel accordion ────────────────────────────────────────────────────

function TemplateGroup({
  channel,
  label,
  templates,
  onSave,
  onDelete,
  onFavorite,
}: {
  channel: TemplateChannel
  label: string
  templates: Template[]
  onSave: (edit: EditState) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onFavorite: (id: string, val: boolean) => Promise<void>
}) {
  const newKey = `new-${channel}`
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const Icon = channel === 'sms' ? MessageSquare : Mail

  function startNew() {
    setEditing({ id: newKey, name: '', subject: '', body: '', channel, category: '', is_favorite: false })
    setOpen(true)
  }

  function startEdit(t: Template) {
    setEditing({ id: t.id, name: t.name, subject: t.subject || '', body: t.body, channel, category: t.category || '', is_favorite: t.is_favorite ?? false })
  }

  function cancelEdit() { setEditing(null) }

  async function save() {
    if (!editing) return
    setSaving(true)
    await onSave(editing)
    setSaving(false)
    setEditing(null)
    if (editing.id.startsWith('new-')) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }

  // Group templates: favorites first, then by category
  const favorites = templates.filter(t => t.is_favorite)
  const nonFavorites = templates.filter(t => !t.is_favorite)
  const categoryMap = new Map<string, Template[]>()
  for (const t of nonFavorites) {
    const cat = t.category?.trim() || 'General'
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push(t)
  }
  const sortedCategories = [...categoryMap.keys()].sort()

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
          <span className="text-xs text-muted-foreground font-normal">({templates.length})</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-3">

          {/* Favorites section */}
          {favorites.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-yellow-500 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <Star className="h-3 w-3" fill="currentColor" /> Favorites
              </p>
              <div className="space-y-2">
                {favorites.map(t => (
                  editing?.id === t.id
                    ? <TemplateForm key={t.id} editing={editing} channel={channel} saving={saving} onChange={setEditing} onSave={save} onCancel={cancelEdit} />
                    : <TemplateCard key={t.id} template={t} onEdit={startEdit} onDelete={onDelete} onFavorite={onFavorite} />
                ))}
              </div>
            </div>
          )}

          {/* Category sections */}
          {sortedCategories.map(cat => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat}</p>
              <div className="space-y-2">
                {categoryMap.get(cat)!.map(t => (
                  editing?.id === t.id
                    ? <TemplateForm key={t.id} editing={editing} channel={channel} saving={saving} onChange={setEditing} onSave={save} onCancel={cancelEdit} />
                    : <TemplateCard key={t.id} template={t} onEdit={startEdit} onDelete={onDelete} onFavorite={onFavorite} />
                ))}
              </div>
            </div>
          ))}

          {templates.length === 0 && !editing && (
            <p className="text-xs text-muted-foreground text-center py-2">No templates yet.</p>
          )}

          {/* New template form */}
          {editing?.id === newKey && (
            <TemplateForm editing={editing} channel={channel} saving={saving} onChange={setEditing} onSave={save} onCancel={cancelEdit} />
          )}

          <button
            onClick={startNew}
            className="w-full text-left p-3 rounded-lg border border-dashed text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add {channel === 'sms' ? 'SMS' : 'email'} template
          </button>
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function TemplatesClient({ templates: initial, userId, channel: filterChannel }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial)
  const supabase = createClient()

  const smsTemplates = templates.filter(t => t.channel === 'sms')
  const emailTemplates = templates.filter(t => t.channel === 'email')

  async function handleSave(edit: EditState) {
    const isNew = edit.id.startsWith('new-')
    const payload = {
      name: edit.name,
      category: edit.category.trim() || 'General',
      subject: edit.subject || null,
      body: edit.body,
      is_favorite: edit.is_favorite,
    }
    if (isNew) {
      const { data, error } = await supabase
        .from('templates')
        .insert({ user_id: userId, channel: edit.channel, ...payload })
        .select().single()
      if (!error && data) setTemplates(prev => [...prev, data])
    } else {
      const { data, error } = await supabase
        .from('templates').update(payload).eq('id', edit.id).select().single()
      if (!error && data) setTemplates(prev => prev.map(t => t.id === data.id ? data : t))
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  async function handleFavorite(id: string, val: boolean) {
    await supabase.from('templates').update({ is_favorite: val }).eq('id', id)
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_favorite: val } : t))
  }

  const commonProps = { onSave: handleSave, onDelete: handleDelete, onFavorite: handleFavorite }

  if (filterChannel === 'sms') {
    return <TemplateGroup channel="sms" label="SMS Response Templates" templates={smsTemplates} {...commonProps} />
  }
  if (filterChannel === 'email') {
    return <TemplateGroup channel="email" label="Email Response Templates" templates={emailTemplates} {...commonProps} />
  }

  return (
    <div className="space-y-3">
      <TemplateGroup channel="sms" label="SMS Responses" templates={smsTemplates} {...commonProps} />
      <TemplateGroup channel="email" label="Email Responses" templates={emailTemplates} {...commonProps} />
    </div>
  )
}
