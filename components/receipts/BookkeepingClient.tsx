'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Category {
  id: string
  name: string
  requires_vehicle: boolean
  qb_account_name: string | null
  is_default: boolean
  sort_order: number
}

interface Props {
  categories: Category[]
}

interface FormState {
  name: string
  requires_vehicle: boolean
  qb_account_name: string
}

const emptyForm: FormState = { name: '', requires_vehicle: false, qb_account_name: '' }

export default function BookkeepingClient({ categories: initial }: Props) {
  const router = useRouter()
  const [categories, setCategories] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  function openEdit(cat: Category) {
    setEditingId(cat.id)
    setForm({
      name: cat.name,
      requires_vehicle: cat.requires_vehicle,
      qb_account_name: cat.qb_account_name ?? '',
    })
    setShowForm(true)
    setError(null)
  }

  function cancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  async function save() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: form.name.trim(),
        requires_vehicle: form.requires_vehicle,
        qb_account_name: form.qb_account_name.trim() || null,
      }

      if (editingId) {
        const res = await fetch(`/api/receipts/categories/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setCategories(prev => prev.map(c => c.id === editingId ? { ...c, ...data.category } : c))
      } else {
        const res = await fetch('/api/receipts/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setCategories(prev => [...prev, data.category])
      }
      cancel()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Existing transactions will keep it.')) return
    try {
      const res = await fetch(`/api/receipts/categories/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Delete failed')
        return
      }
      setCategories(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      alert(String(e))
    }
  }

  return (
    <div className="px-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Categories used for receipt classification. Map to QuickBooks account names for export.
      </p>

      {/* Category list */}
      <div className="divide-y rounded-xl border bg-card overflow-hidden">
        {categories.map(cat => (
          <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{cat.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {cat.requires_vehicle && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">requires vehicle</span>
                )}
                {cat.qb_account_name && (
                  <span className="text-xs text-muted-foreground">→ {cat.qb_account_name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => openEdit(cat)}
                className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {!cat.is_default && (
                <button
                  onClick={() => deleteCategory(cat.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      {!showForm && (
        <Button variant="outline" className="w-full gap-2" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add Category
        </Button>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-semibold">{editingId ? 'Edit Category' : 'New Category'}</p>

          <div>
            <Label htmlFor="cat-name" className="text-xs">Category Name</Label>
            <Input
              id="cat-name"
              className="mt-1"
              placeholder="e.g. Recon: Detail"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="qb-account" className="text-xs">QuickBooks Account Name (optional)</Label>
            <Input
              id="qb-account"
              className="mt-1"
              placeholder="e.g. Vehicle Reconditioning"
              value={form.qb_account_name}
              onChange={e => setForm(f => ({ ...f, qb_account_name: e.target.value }))}
            />
          </div>

          <button
            onClick={() => setForm(f => ({ ...f, requires_vehicle: !f.requires_vehicle }))}
            className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              form.requires_vehicle ? 'border-primary bg-primary/5' : 'border-border'
            }`}
          >
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              form.requires_vehicle ? 'border-primary bg-primary' : 'border-muted-foreground/40'
            }`}>
              {form.requires_vehicle && <Check className="h-2.5 w-2.5 text-white" />}
            </div>
            <div>
              <p className="text-sm font-medium">Requires vehicle</p>
              <p className="text-xs text-muted-foreground">Flags receipts to be linked to inventory</p>
            </div>
          </button>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={cancel}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button className="flex-1 bg-[#F07018] hover:bg-[#d95e10] text-white" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
              {editingId ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
