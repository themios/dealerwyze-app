'use client'


import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, ArrowLeft, Copy, Check } from 'lucide-react'
import Link from 'next/link'

interface User {
  id: string
  display_name: string
  role: 'admin' | 'agent'
  org_id: string
  invite_code?: string
  assigned_count: number
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', role: 'agent' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    if (res.status === 403) { setLoading(false); return }
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const adminProfile = users.find(u => u.role === 'admin')
  const inviteCode = adminProfile?.invite_code

  async function copyCode() {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function generateCode() {
    setGeneratingCode(true)
    const res = await fetch('/api/admin/users', { method: 'PATCH' })
    const data = await res.json() as { invite_code?: string }
    if (data.invite_code) {
      setUsers(prev => prev.map(u => u.role === 'admin' ? { ...u, invite_code: data.invite_code } : u))
    }
    setGeneratingCode(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Failed to create user')
    } else {
      setInviteOpen(false)
      setForm({ email: '', display_name: '', password: '', role: 'agent' })
      loadUsers()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this user? They will lose access immediately.')) return
    setDeleting(id)
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
    setDeleting(null)
    loadUsers()
  }

  return (
    <div>
      <TopBar
        title="Team"
        right={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />

      <div className="px-4 py-3 space-y-4">
        {/* Invite code card */}
        {!inviteCode ? (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground mb-2">No team code yet</p>
            <Button size="sm" onClick={generateCode} disabled={generatingCode}>
              {generatingCode ? 'Generating…' : 'Generate Team Code'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Share this code with agents so they can join your team.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground mb-1">Your Team Code</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-mono font-bold tracking-widest flex-1">{inviteCode}</p>
              <Button variant="outline" size="sm" onClick={copyCode}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Share this code with agents so they can create their own account and join your team.
            </p>
          </div>
        )}

        {/* Team list */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{u.display_name}</p>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs capitalize">
                      {u.role}
                    </Badge>
                  </div>
                  {u.role === 'agent' && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {u.assigned_count} assigned lead{u.assigned_count !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                {u.role !== 'admin' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(u.id)}
                    disabled={deleting === u.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <p className="text-4xl mb-3">👥</p>
                <p className="font-medium">No team members yet</p>
                <Button className="mt-4" onClick={() => setInviteOpen(true)}>Add Team Member</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl h-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Add Team Member</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                placeholder="John Smith"
                value={form.display_name}
                onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="john@apolloauto.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
                minLength={8}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent (sees only assigned leads)</SelectItem>
                  <SelectItem value="admin">Admin (sees all leads)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-11" disabled={saving}>
              {saving ? 'Creating…' : 'Create Account'}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
