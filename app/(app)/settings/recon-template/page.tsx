'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

interface TemplateItem {
  label: string
  is_required: boolean
  sort_order: number
}

export default function ReconTemplatePage() {
  const router = useRouter()
  const [items, setItems] = useState<TemplateItem[]>([])
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    fetch('/api/settings/recon-template')
      .then(r => r.json())
      .then(data => {
        setItems(data.template ?? [])
        setIsCustom(data.is_custom ?? false)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function updateItem(index: number, field: keyof TemplateItem, value: string | boolean) {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function removeItem(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function addItem() {
    const label = newLabel.trim().slice(0, 120)
    if (!label) return
    setItems(prev => [...prev, { label, is_required: false, sort_order: prev.length + 1 }])
    setNewLabel('')
  }

  async function handleSave() {
    setSaving(true)
    const template = items.map((item, i) => ({ ...item, sort_order: i + 1 }))
    const res = await fetch('/api/settings/recon-template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    })
    if (res.ok) {
      setIsCustom(true)
      router.refresh()
    }
    setSaving(false)
  }

  async function handleReset() {
    setSaving(true)
    await fetch('/api/settings/recon-template', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: [] }),
    })
    // Reload from server
    const res = await fetch('/api/settings/recon-template')
    const data = await res.json()
    setItems(data.template ?? [])
    setIsCustom(false)
    setSaving(false)
  }

  return (
    <SettingsPageShell
      title="Recon Checklist Template"
      description="Set the default staging checklist applied to new vehicles."
      type="form"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          This template is applied when a new vehicle is added in Staging status. Changes here do not affect existing vehicles.
        </p>

        {isCustom && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-400 flex-1">Using custom template</p>
            <ConfirmActionDialog
              title="Reset to default checklist?"
              description="This restores the default recon template. Existing vehicles will not be changed."
              confirmLabel={saving ? 'Resetting...' : 'Reset to default'}
              confirmVariant="destructive"
              onConfirm={handleReset}
              trigger={(
                <Button size="sm" variant="ghost" className="h-7 text-xs text-blue-700" disabled={saving}>
                  Reset to default
                </Button>
              )}
            />
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateItem(index, 'label', e.target.value.slice(0, 120))}
                    className="w-full text-sm bg-transparent border-none outline-none focus:ring-0 p-0"
                    placeholder="Item label..."
                  />
                </div>
                <label className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={item.is_required}
                    onChange={e => updateItem(index, 'is_required', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-xs text-muted-foreground">Required</span>
                </label>
                <button
                  onClick={() => removeItem(index)}
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add item..."
              maxLength={120}
              className="flex-1 rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" variant="outline" onClick={addItem} disabled={!newLabel.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!loading && items.length > 0 && (
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground">Max 30 items. Each item max 120 characters.</p>
      </div>
    </SettingsPageShell>
  )
}
