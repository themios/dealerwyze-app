'use client'

import { useState, useEffect, useCallback } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Plus, UserX, ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react'
import Link from 'next/link'

type UserRole = 'dealer_admin' | 'dealer_manager' | 'dealer_finance' | 'dealer_rep' | 'dealer_staff' | 'admin' | 'agent'

const ROLE_LABELS: Record<string, string> = {
  dealer_admin: 'Admin',
  dealer_manager: 'Manager',
  dealer_finance: 'Finance / BDR',
  dealer_rep: 'Sales Rep',
  dealer_staff: 'Staff',
  admin: 'Admin',
  agent: 'Agent',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  dealer_admin: 'Full access including billing and user management',
  dealer_manager: 'All leads, inventory and reports — no billing',
  dealer_finance: 'Full operational access including BHPH and ledger',
  dealer_rep: 'Sees only their assigned leads',
  dealer_staff: 'Full operational access — no billing or user management',
}

const INVITE_ROLES: UserRole[] = ['dealer_staff', 'dealer_rep', 'dealer_finance', 'dealer_manager', 'dealer_admin']

const ROLE_BADGE_COLOR: Record<string, string> = {
  dealer_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-purple-100 text-purple-700',
  dealer_manager: 'bg-blue-100 text-blue-700',
  dealer_finance: 'bg-yellow-100 text-yellow-700',
  dealer_rep: 'bg-green-100 text-green-700',
  dealer_staff: 'bg-gray-100 text-gray-700',
  agent: 'bg-gray-100 text-gray-700',
}

interface User {
  id: string
  display_name: string
  role: UserRole
  org_id: string
  invite_code?: string
  assigned_count: number
  deactivated_at?: string | null
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [showDeactivated, setShowDeactivated] = useState(false)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', role: 'dealer_rep' as UserRole })
  const [assignMode, setAssignMode] = useState<'owner' | 'round_robin' | 'manual'>('owner')
  const [assignModeSaving, setAssignModeSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [roleChanging, setRoleChanging] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users${showDeactivated ? '?include_deactivated=true' : ''}`)
    if (res.status === 403) { setLoading(false); return }
    const data = await res.json()
    setUsers(data.users ?? [])
    if (data.lead_assignment_mode) setAssignMode(data.lead_assignment_mode)
    setLoading(false)
  }, [showDeactivated])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function saveAssignMode(mode: 'owner' | 'round_robin' | 'manual') {
    setAssignMode(mode)
    setAssignModeSaving(true)
    await fetch('/api/settings/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_assignment_mode: mode, lead_assignment_rep_index: 0 }),
    })
    setAssignModeSaving(false)
  }

  const adminProfile = users.find(u => u.role === 'dealer_admin' || u.role === 'admin')
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
      setUsers(prev => prev.map(u => (u.role === 'dealer_admin' || u.role === 'admin') ? { ...u, invite_code: data.invite_code } : u))
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
      setForm({ email: '', display_name: '', password: '', role: 'dealer_staff' })
      loadUsers()
    }
    setSaving(false)
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Deactivate this user? They will lose access immediately. Their assigned leads will be preserved.')) return
    setBusy(id)
    await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' })
    setBusy(null)
    loadUsers()
  }

  async function handleReactivate(id: string) {
    setBusy(id)
    await fetch(`/api/admin/users/${id}`, { method: 'POST' })
    setBusy(null)
    loadUsers()
  }

  async function handleRoleChange(id: string, newRole: UserRole) {
    setRoleChanging(id)
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    setRoleChanging(null)
    loadUsers()
  }

  return (
    <div>
      <TopBar
        title="Team"
        right={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)} title="Add team member">
              <Plus className="h-4 w-4" />
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="sm" title="Back to settings"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />

      <div className="px-4 py-3 space-y-4">
        {/* Lead Assignment Mode */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">New Lead Assignment</p>
            <p className="text-xs text-muted-foreground mt-0.5">Who gets new leads when they come in</p>
          </div>
          <div className="space-y-2">
            {([
              { value: 'owner', label: 'Owner only', desc: 'All new leads go to the dealership admin' },
              { value: 'round_robin', label: 'Round robin', desc: 'Rotate leads evenly across all active sales reps' },
              { value: 'manual', label: 'Manual', desc: 'Leads arrive unassigned — admin assigns them' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => saveAssignMode(opt.value)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${assignMode === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                  {assignMode === opt.value && (
                    <span className="text-xs font-semibold text-primary">{assignModeSaving ? 'Saving…' : 'Active'}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Invite code card */}
        {!inviteCode ? (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground mb-2">No team code yet</p>
            <Button size="sm" onClick={generateCode} disabled={generatingCode}>
              {generatingCode ? 'Generating…' : 'Generate Team Code'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Share this code so team members can self-register and join your org.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground mb-1">Your Team Code</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-mono font-bold tracking-widest flex-1">{inviteCode}</p>
              <Button variant="outline" size="sm" onClick={copyCode} title="Copy to clipboard">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Team members use this code during signup to join your dealership.
            </p>
          </div>
        )}

        {/* Deactivated toggle */}
        <div className="flex justify-end">
          <button
            onClick={() => setShowDeactivated(p => !p)}
            className="text-xs text-muted-foreground underline"
          >
            {showDeactivated ? 'Hide deactivated' : 'Show deactivated'}
          </button>
        </div>

        {/* Team list */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const isAdmin = u.role === 'dealer_admin' || u.role === 'admin'
              const isDeactivated = !!u.deactivated_at
              return (
                <div key={u.id} className={`p-4 rounded-lg border bg-card space-y-2 ${isDeactivated ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{u.display_name}</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_COLOR[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                      {isDeactivated && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                          Deactivated
                        </span>
                      )}
                    </div>
                    {!isAdmin && !isDeactivated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivate(u.id)}
                        disabled={busy === u.id}
                        className="text-destructive hover:text-destructive shrink-0"
                        title="Deactivate user"
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                    {isDeactivated && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReactivate(u.id)}
                        disabled={busy === u.id}
                        className="shrink-0"
                        title="Reactivate user"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {u.assigned_count} assigned lead{u.assigned_count !== 1 ? 's' : ''}
                  </p>
                  {/* Role change dropdown (non-admin, non-deactivated) */}
                  {!isAdmin && !isDeactivated && (
                    <Select
                      value={u.role}
                      onValueChange={v => handleRoleChange(u.id, v as UserRole)}
                      disabled={roleChanging === u.id}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVITE_ROLES.filter(r => r !== 'dealer_admin').map(r => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {ROLE_LABELS[r]} — {ROLE_DESCRIPTIONS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })}
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
                placeholder="john@yourdealership.com"
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
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as UserRole }))}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      <div>
                        <p className="font-medium">{ROLE_LABELS[r]}</p>
                        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
                      </div>
                    </SelectItem>
                  ))}
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
