'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { UserPlus, Trash2, Shield } from 'lucide-react'

interface StaffMember {
  id: string
  display_name: string
  created_at: string
}

export default function AdminTeamPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ email: '', display_name: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/platform-staff')
    if (res.ok) setStaff(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    const res = await fetch('/api/admin/platform-staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to invite')
    } else {
      setSuccess(`${data.display_name} added as platform staff.`)
      setForm({ email: '', display_name: '', password: '' })
      load()
    }
    setSaving(false)
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from platform staff?`)) return
    await fetch(`/api/admin/platform-staff?id=${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <TopBar title="Platform Team" />
      <div className="p-4 space-y-6 max-w-lg mx-auto">

        {/* Current staff list */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Platform Staff</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No platform staff yet.</p>
          ) : (
            <ul className="space-y-2">
              {staff.map(s => (
                <li key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-red-400" />
                    <span className="text-sm font-medium">{s.display_name}</span>
                  </div>
                  <button
                    onClick={() => remove(s.id, s.display_name)}
                    className="p-1 hover:text-red-500 text-muted-foreground transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invite form */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Invite Platform Staff</h2>
          <form onSubmit={invite} className="space-y-3">
            <input
              type="text"
              placeholder="Display name"
              value={form.display_name}
              onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm"
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm"
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-500">{success}</p>}
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              {saving ? 'Adding…' : 'Add Platform Staff'}
            </button>
          </form>
        </div>

        {/* Back link */}
        <a href="/admin" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to Admin
        </a>
      </div>
    </div>
  )
}
