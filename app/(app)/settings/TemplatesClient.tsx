'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Template, TemplateChannel } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'

interface Props {
  templates: Template[]
  userId: string
}

type EditState = {
  id: string
  name: string
  subject: string
  body: string
  channel: TemplateChannel
}

function TemplateGroup({
  channel,
  label,
  templates,
  userId,
  onSave,
  onDelete,
}: {
  channel: TemplateChannel
  label: string
  templates: Template[]
  userId: string
  onSave: (edit: EditState) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const newKey = `new-${channel}`
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function startNew() {
    setEditing({ id: newKey, name: '', subject: '', body: '', channel })
  }

  function startEdit(t: Template) {
    setEditing({ id: t.id, name: t.name, subject: t.subject || '', body: t.body, channel })
  }

  function cancelEdit() {
    setEditing(null)
  }

  async function save() {
    if (!editing) return
    setSaving(true)
    await onSave(editing)
    setSaving(false)
    setEditing(null)
  }

  async function doDelete(id: string) {
    await onDelete(id)
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>

      {templates.map(t => (
        <div key={t.id}>
          {editing?.id === t.id ? (
            <div className="p-3 rounded-lg border bg-card space-y-2">
              <Input
                placeholder="Template name"
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
              />
              {channel === 'email' && (
                <Input
                  placeholder="Email subject"
                  value={editing.subject}
                  onChange={e => setEditing({ ...editing, subject: e.target.value })}
                />
              )}
              <Textarea
                placeholder="Message body"
                value={editing.body}
                onChange={e => setEditing({ ...editing, body: e.target.value })}
                className="resize-none text-sm font-mono"
                rows={5}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
                  <X className="h-3.5 w-3.5" />Cancel
                </Button>
                <Button size="sm" onClick={save} disabled={saving || !editing.name || !editing.body} className="gap-1">
                  <Check className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-lg border bg-card flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{t.name}</p>
                {t.subject && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>}
              </div>
              <button
                onClick={() => startEdit(t)}
                className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {confirmDelete === t.id ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => doDelete(t.id)} className="text-destructive text-xs font-medium px-1">
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground p-1">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(t.id)}
                  className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {editing?.id === newKey ? (
        <div className="p-3 rounded-lg border border-dashed bg-card/50 space-y-2">
          <Input
            placeholder="Template name"
            value={editing.name}
            onChange={e => setEditing({ ...editing, name: e.target.value })}
            autoFocus
          />
          {channel === 'email' && (
            <Input
              placeholder="Email subject"
              value={editing.subject}
              onChange={e => setEditing({ ...editing, subject: e.target.value })}
            />
          )}
          <Textarea
            placeholder="Message body"
            value={editing.body}
            onChange={e => setEditing({ ...editing, body: e.target.value })}
            className="resize-none text-sm font-mono"
            rows={5}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1">
              <X className="h-3.5 w-3.5" />Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !editing.name || !editing.body} className="gap-1">
              <Check className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={startNew}
          className="w-full text-left p-3 rounded-lg border border-dashed text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add {channel === 'sms' ? 'SMS' : 'email'} template
        </button>
      )}
    </div>
  )
}

export default function TemplatesClient({ templates: initial, userId }: Props) {
  const [templates, setTemplates] = useState<Template[]>(initial)
  const supabase = createClient()

  const smsTemplates = templates.filter(t => t.channel === 'sms')
  const emailTemplates = templates.filter(t => t.channel === 'email')

  async function handleSave(edit: EditState) {
    const isNew = edit.id.startsWith('new-')
    if (isNew) {
      const { data, error } = await supabase
        .from('templates')
        .insert({
          user_id: userId,
          name: edit.name,
          channel: edit.channel,
          category: 'lead_response',
          subject: edit.subject || null,
          body: edit.body,
        })
        .select()
        .single()
      if (!error && data) setTemplates(prev => [...prev, data])
    } else {
      const { data, error } = await supabase
        .from('templates')
        .update({ name: edit.name, subject: edit.subject || null, body: edit.body })
        .eq('id', edit.id)
        .select()
        .single()
      if (!error && data) setTemplates(prev => prev.map(t => t.id === data.id ? data : t))
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-6">
      <TemplateGroup
        channel="sms"
        label="SMS Responses"
        templates={smsTemplates}
        userId={userId}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <TemplateGroup
        channel="email"
        label="Email Responses"
        templates={emailTemplates}
        userId={userId}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
