'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  UserPlus, Trash2, Shield, Mail, Clock,
  TicketCheck, Building2, ChevronRight, Pencil, Check, X,
  Settings, Users, Briefcase,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  platform_admin:          'Admin',
  platform_staff_manager:  'Staff Manager',
  platform_sales_manager:  'Sales Manager',
  platform_staff:          'Support Staff',
}

const ROLE_COLORS: Record<string, string> = {
  platform_admin:          'bg-purple-100 text-purple-700 border-purple-200',
  platform_staff_manager:  'bg-blue-100 text-blue-700 border-blue-200',
  platform_sales_manager:  'bg-green-100 text-green-700 border-green-200',
  platform_staff:          'bg-gray-100 text-gray-600 border-gray-200',
}

const AREAS = [
  { key: 'dealers',     label: 'Dealerships' },
  { key: 'retention',   label: 'Retention' },
  { key: 'sales',       label: 'Sales Team' },
  { key: 'analytics',   label: 'Analytics' },
  { key: 'staff',       label: 'Staff Mgmt' },
  { key: 'tickets',     label: 'Tickets' },
  { key: 'alerts',      label: 'Alerts' },
  { key: 'affiliates',  label: 'Affiliates' },
  { key: 'commissions', label: 'Commissions' },
  { key: 'audit',       label: 'Audit Log' },
  { key: 'billing',     label: 'Billing' },
]

const ROLE_DEFAULT_AREAS: Record<string, string[]> = {
  platform_staff_manager: ['dealers', 'retention', 'staff', 'tickets', 'alerts'],
  platform_sales_manager: ['dealers', 'retention', 'sales', 'analytics', 'affiliates', 'commissions'],
  platform_staff:         ['tickets', 'dealers'],
  platform_admin:         [],
}

interface PlatformUser {
  id: string
  display_name: string
  email: string | null
  last_sign_in_at: string | null
  created_at: string
  platform_role: string
  platform_permissions: string[]
  tickets_open?: number
  tickets_closed?: number
  orgs_assigned?: number
}

type TabKey = 'staff' | 'managers' | 'admins'

function humanizeAgo(d: string | null, nowMs: number) {
  if (!d) return 'Never'
  const days = Math.floor((nowMs - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30)  return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function ActivityDot({ lastSignIn, nowMs }: { lastSignIn: string | null; nowMs: number }) {
  if (!lastSignIn) return <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
  const days = (nowMs - new Date(lastSignIn).getTime()) / 86400000
  const color = days < 7 ? 'bg-green-500' : days < 30 ? 'bg-yellow-500' : 'bg-red-400'
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}

export default function AdminStaffPage() {
  const [nowMs] = useState(() => Date.now())
  const [users, setUsers]         = useState<PlatformUser[]>([])
  const [staffStats, setStaffStats] = useState<Record<string, { tickets_open: number; tickets_closed: number; orgs_assigned: number }>>({})
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<TabKey>('staff')

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    display_name: '', email: '', platform_role: 'platform_staff', platform_permissions: [] as string[],
  })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError]   = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  // Inline name edit
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editName, setEditName]     = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError]   = useState('')

  // Role edit
  const [editRoleId, setEditRoleId]         = useState<string | null>(null)
  const [editRoleForm, setEditRoleForm]     = useState<{ platform_role: string; platform_permissions: string[] } | null>(null)
  const [editRoleSaving, setEditRoleSaving] = useState(false)
  const [editRoleError, setEditRoleError]   = useState('')

  async function load(options?: { showSpinner?: boolean }) {
    if (options?.showSpinner !== false) setLoading(true)
    const [usersRes, staffRes] = await Promise.all([
      fetch('/api/admin/platform-users').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/staff').then(r => r.ok ? r.json() : []),
    ])
    setUsers(usersRes ?? [])
    // Build stats map from the staff-specific endpoint
    const map: Record<string, { tickets_open: number; tickets_closed: number; orgs_assigned: number }> = {}
    for (const s of staffRes ?? []) {
      map[s.id] = { tickets_open: s.tickets_open ?? 0, tickets_closed: s.tickets_closed ?? 0, orgs_assigned: s.orgs_assigned ?? 0 }
    }
    setStaffStats(map)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const [usersRes, staffRes] = await Promise.all([
        fetch('/api/admin/platform-users').then(r => r.ok ? r.json() : []),
        fetch('/api/admin/staff').then(r => r.ok ? r.json() : []),
      ])
      if (cancelled) return

      setUsers(usersRes ?? [])
      const map: Record<string, { tickets_open: number; tickets_closed: number; orgs_assigned: number }> = {}
      for (const s of staffRes ?? []) {
        map[s.id] = { tickets_open: s.tickets_open ?? 0, tickets_closed: s.tickets_closed ?? 0, orgs_assigned: s.orgs_assigned ?? 0 }
      }
      setStaffStats(map)
      setLoading(false)
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  const staffUsers    = users.filter(u => u.platform_role === 'platform_staff')
  const managerUsers  = users.filter(u => u.platform_role === 'platform_staff_manager' || u.platform_role === 'platform_sales_manager')
  const adminUsers    = users.filter(u => u.platform_role === 'platform_admin')

  const tabUsers = tab === 'staff' ? staffUsers : tab === 'managers' ? managerUsers : adminUsers

  // Role selector default areas
  const defaultPermsForRole = (role: string) => ROLE_DEFAULT_AREAS[role] ?? []

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    setInviteSaving(true)
    setInviteError('')
    setInviteSuccess('')
    const res = await fetch('/api/admin/platform-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    const data = await res.json()
    if (!res.ok) {
      setInviteError(data.error ?? 'Failed to invite')
    } else {
      setInviteSuccess(`Invite sent to ${data.email}.`)
      setInviteForm({ display_name: '', email: '', platform_role: 'platform_staff', platform_permissions: [] })
      load()
    }
    setInviteSaving(false)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    setEditError('')
    const res = await fetch('/api/admin/platform-staff', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, display_name: editName.trim() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setEditError(data.error ?? 'Failed to save')
    } else {
      setEditingId(null)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, display_name: editName.trim() } : u))
    }
    setEditSaving(false)
  }

  async function saveRoleEdit(id: string) {
    if (!editRoleForm) return
    setEditRoleSaving(true)
    setEditRoleError('')
    const res = await fetch(`/api/admin/platform-users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editRoleForm),
    })
    const data = await res.json()
    if (!res.ok) {
      setEditRoleError(data.error ?? 'Failed to save')
    } else {
      setEditRoleId(null)
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...editRoleForm } : u))
    }
    setEditRoleSaving(false)
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from the platform team?`)) return
    await fetch(`/api/admin/platform-users/${id}`, { method: 'DELETE' })
    load()
  }

  const TABS: { key: TabKey; label: string; count: number; icon: React.ElementType }[] = [
    { key: 'staff',    label: 'Support Staff',    count: staffUsers.length,   icon: Users },
    { key: 'managers', label: 'Managers',          count: managerUsers.length, icon: Briefcase },
    { key: 'admins',   label: 'Admins',            count: adminUsers.length,   icon: Settings },
  ]

  return (
    <div>
      <TopBar title="Platform Team" />
      <div className="px-4 py-4 lg:px-6 space-y-5 max-w-3xl">

        {/* Summary strip */}
        {users.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`rounded-xl border p-4 text-left transition-colors ${tab === t.key ? 'border-[#0D2B55] bg-[#0D2B55]/5' : 'bg-card hover:bg-accent/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <t.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{t.label}</span>
                </div>
                <p className="text-2xl font-bold">{t.count}</p>
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex rounded-lg border bg-card overflow-hidden">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors flex-1 justify-center ${
                tab === t.key ? 'bg-[#0D2B55] text-white' : 'text-muted-foreground hover:bg-accent'
              }`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label} ({tab === t.key ? tabUsers.length : t.count})
            </button>
          ))}
        </div>

        {/* User list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tabUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {TABS.find(t => t.key === tab)?.label.toLowerCase()} yet.</p>
        ) : (
          <div className="space-y-2">
            {tabUsers.map(u => {
              const stats = staffStats[u.id]
              return (
                <div key={u.id} className="rounded-xl border bg-card overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 p-4 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative">
                        <div className="h-9 w-9 rounded-full bg-[#0D2B55] flex items-center justify-center shrink-0">
                          <Shield className="h-4 w-4 text-white/80" />
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <ActivityDot lastSignIn={u.last_sign_in_at} nowMs={nowMs} />
                        </span>
                      </div>
                      <div className="min-w-0">
                        {/* Name (editable) */}
                        {editingId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <input autoFocus value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(u.id); if (e.key === 'Escape') setEditingId(null) }}
                              className="flex-1 min-w-0 px-2 py-1 text-sm rounded-md border border-primary bg-background" />
                            <button onClick={() => saveEdit(u.id)} disabled={editSaving} className="p-1 text-green-600 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {tab === 'staff' ? (
                              <Link href={`/admin/staff/${u.id}`} className="font-semibold text-sm hover:text-primary flex items-center gap-1">
                                {u.display_name}
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </Link>
                            ) : (
                              <span className="font-semibold text-sm">{u.display_name}</span>
                            )}
                            <RoleBadge role={u.platform_role} />
                          </div>
                        )}
                        {editError && editingId === u.id && <p className="text-xs text-red-500">{editError}</p>}
                        {u.email && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3 shrink-0" />{u.email}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setEditingId(u.id); setEditName(u.display_name); setEditError('') }}
                        className="p-1.5 hover:text-primary text-muted-foreground transition-colors" title="Edit name">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditRoleId(u.id); setEditRoleForm({ platform_role: u.platform_role, platform_permissions: [...u.platform_permissions] }); setEditRoleError('') }}
                        className="p-1.5 hover:text-primary text-muted-foreground transition-colors" title="Edit role & permissions">
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(u.id, u.display_name)}
                        className="p-1.5 hover:text-red-500 text-muted-foreground transition-colors" title="Remove platform access">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Role edit panel */}
                  {editRoleId === u.id && editRoleForm && (
                    <div className="border-t px-4 py-3 bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">Edit Role & Access</span>
                        <button onClick={() => setEditRoleId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Role</label>
                        <select value={editRoleForm.platform_role}
                          onChange={e => setEditRoleForm(f => f ? { ...f, platform_role: e.target.value, platform_permissions: defaultPermsForRole(e.target.value) } : f)}
                          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background">
                          <option value="platform_staff">Support Staff</option>
                          <option value="platform_staff_manager">Staff Manager</option>
                          <option value="platform_sales_manager">Sales Manager</option>
                          <option value="platform_admin">Admin (custom permissions)</option>
                        </select>
                      </div>
                      {editRoleForm.platform_role === 'platform_admin' && (
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-2 block">Permitted Areas</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {AREAS.map(a => (
                              <label key={a.key} className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox"
                                  checked={editRoleForm.platform_permissions.includes(a.key)}
                                  onChange={e => setEditRoleForm(f => f ? {
                                    ...f,
                                    platform_permissions: e.target.checked
                                      ? [...f.platform_permissions, a.key]
                                      : f.platform_permissions.filter(p => p !== a.key)
                                  } : f)}
                                  className="rounded border-gray-300 text-primary" />
                                <span className="text-xs">{a.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            Staff Manager and Sales Manager have fixed permissions. Only Admin role uses custom checkboxes.
                          </p>
                        </div>
                      )}
                      {editRoleForm.platform_role !== 'platform_admin' && (
                        <div>
                          <p className="text-xs text-muted-foreground">Default access for this role:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(ROLE_DEFAULT_AREAS[editRoleForm.platform_role] ?? []).map(a => (
                              <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {AREAS.find(x => x.key === a)?.label ?? a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {editRoleError && <p className="text-xs text-red-500">{editRoleError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => saveRoleEdit(u.id)} disabled={editRoleSaving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium disabled:opacity-50">
                          <Check className="h-3.5 w-3.5" />
                          {editRoleSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditRoleId(null)} className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Stats row (support staff only) */}
                  {tab === 'staff' && stats && (
                    <div className="border-t grid grid-cols-3 divide-x text-center">
                      <div className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <TicketCheck className="h-3 w-3" />
                          <span className="text-[10px] uppercase tracking-wide font-medium">Tickets</span>
                        </div>
                        <p className="text-sm font-bold">{stats.tickets_closed}</p>
                        <p className="text-[10px] text-muted-foreground">closed · <span className={stats.tickets_open > 0 ? 'text-orange-500 font-medium' : ''}>{stats.tickets_open} open</span></p>
                      </div>
                      <div className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <Building2 className="h-3 w-3" />
                          <span className="text-[10px] uppercase tracking-wide font-medium">Assigned</span>
                        </div>
                        <p className="text-sm font-bold">{stats.orgs_assigned}</p>
                        <p className="text-[10px] text-muted-foreground">dealerships</p>
                      </div>
                      <div className="py-2.5 px-2">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px] uppercase tracking-wide font-medium">Last Active</span>
                        </div>
                        <p className="text-sm font-bold">{humanizeAgo(u.last_sign_in_at, nowMs)}</p>
                        <p className="text-[10px] text-muted-foreground">login</p>
                      </div>
                    </div>
                  )}

                  {/* Manager/Admin info row */}
                  {tab !== 'staff' && (
                    <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last active: {humanizeAgo(u.last_sign_in_at, nowMs)}</span>
                      {u.platform_role === 'platform_admin' && u.platform_permissions.length > 0 && (
                        <span className="flex flex-wrap gap-1 max-w-xs justify-end">
                          {u.platform_permissions.map(p => (
                            <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{AREAS.find(a => a.key === p)?.label ?? p}</span>
                          ))}
                        </span>
                      )}
                      {u.platform_role !== 'platform_admin' && (
                        <span className="text-[10px] text-muted-foreground">
                          Fixed access: {(ROLE_DEFAULT_AREAS[u.platform_role] ?? []).map(a => AREAS.find(x => x.key === a)?.label ?? a).join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Ticket resolution chart (staff tab only) */}
        {tab === 'staff' && staffUsers.some(u => (staffStats[u.id]?.tickets_closed ?? 0) + (staffStats[u.id]?.tickets_open ?? 0) > 0) && (
          <section className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ticket Resolution Rate</p>
            <div className="space-y-2">
              {staffUsers.filter(u => (staffStats[u.id]?.tickets_closed ?? 0) + (staffStats[u.id]?.tickets_open ?? 0) > 0)
                .sort((a, b) => (staffStats[b.id]?.tickets_closed ?? 0) - (staffStats[a.id]?.tickets_closed ?? 0))
                .map(u => {
                  const s = staffStats[u.id]!
                  const total = s.tickets_closed + s.tickets_open
                  const pct   = total > 0 ? Math.round((s.tickets_closed / total) * 100) : 0
                  return (
                    <div key={u.id} className="flex items-center gap-3">
                      <Link href={`/admin/staff/${u.id}`} className="text-xs font-medium w-28 truncate hover:text-primary">{u.display_name}</Link>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#0D2B55]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-24 text-right">{s.tickets_closed}/{total} ({pct}%)</span>
                    </div>
                  )
                })}
            </div>
          </section>
        )}

        {/* Add / Invite form */}
        <section>
          {!showInvite ? (
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors">
              <UserPlus className="h-4 w-4" />
              Add Team Member
            </button>
          ) : (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Add Team Member</h3>
                <button onClick={() => { setShowInvite(false); setInviteError(''); setInviteSuccess('') }}
                  className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <form onSubmit={invite} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Name *</label>
                    <input type="text" required placeholder="Full name"
                      value={inviteForm.display_name}
                      onChange={e => setInviteForm(f => ({ ...f, display_name: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email *</label>
                    <input type="email" required placeholder="email@example.com"
                      value={inviteForm.email}
                      onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Role *</label>
                  <select value={inviteForm.platform_role}
                    onChange={e => setInviteForm(f => ({
                      ...f,
                      platform_role: e.target.value,
                      platform_permissions: defaultPermsForRole(e.target.value),
                    }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm">
                    <option value="platform_staff">Support Staff — handles tickets, onboarding, dealer support</option>
                    <option value="platform_staff_manager">Staff Manager — manages support team, all tickets, dealer assignments</option>
                    <option value="platform_sales_manager">Sales Manager — manages sales team, commissions, affiliate performance</option>
                    <option value="platform_admin">Admin — custom access to selected areas</option>
                  </select>
                </div>

                {inviteForm.platform_role === 'platform_admin' && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-semibold">Access Areas</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {AREAS.map(a => (
                        <label key={a.key} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox"
                            checked={inviteForm.platform_permissions.includes(a.key)}
                            onChange={e => setInviteForm(f => ({
                              ...f,
                              platform_permissions: e.target.checked
                                ? [...f.platform_permissions, a.key]
                                : f.platform_permissions.filter(p => p !== a.key),
                            }))}
                            className="rounded border-gray-300 text-primary" />
                          <span className="text-xs">{a.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {inviteForm.platform_role !== 'platform_admin' && inviteForm.platform_role !== 'platform_staff' && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                    <span className="font-medium">Default access:</span>{' '}
                    {(ROLE_DEFAULT_AREAS[inviteForm.platform_role] ?? []).map(a => AREAS.find(x => x.key === a)?.label ?? a).join(', ')}
                  </div>
                )}

                {inviteError   && <p className="text-sm text-red-500">{inviteError}</p>}
                {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
                <button type="submit" disabled={inviteSaving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                  <UserPlus className="h-4 w-4" />
                  {inviteSaving ? 'Sending invite…' : 'Send Invite'}
                </button>
              </form>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
