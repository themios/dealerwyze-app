'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { Plus, DollarSign, Users, CheckCircle2, Clock, Loader2, X, Pencil, Check, ToggleLeft, ToggleRight, UserPlus, ArrowRightLeft, ChevronRight } from 'lucide-react'
import { useVertical } from '@/hooks/useVertical'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AffiliateCode {
  code: string
  type: 'flyer' | 'advisor'
  owner_name: string
  owner_email: string | null
  commission_first_pct: number
  commission_recurring_pct: number
  is_active: boolean
  active_dealer_count: number
  created_at: string
  notes: string | null
}

interface CommissionSummary {
  affiliate_code: string
  owner_name: string
  owner_email: string | null
  type: string
  pending_balance: number
  is_payable: boolean
  all_time_paid: number
}

const PAID_VIA_OPTIONS = ['venmo', 'zelle', 'ach', 'check', 'stripe_connect', 'other']

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminAffiliatesPage() {
  const [tab, setTab] = useState<'codes' | 'commissions'>('codes')

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <TopBar title="Affiliates & Commissions" />

      <div className="flex gap-1 border-b">
        {(['codes', 'commissions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'codes' ? 'Affiliate Codes' : 'Commissions'}
          </button>
        ))}
      </div>

      {tab === 'codes'       && <CodesTab />}
      {tab === 'commissions' && <CommissionsTab />}
    </div>
  )
}

// ── Codes Tab ──────────────────────────────────────────────────────────────────

interface EditForm {
  owner_name: string
  owner_email: string
  type: string
  notes: string
  commission_first_pct: number
  commission_recurring_pct: number
  is_active: boolean
}

function CodesTab() {
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'
  const orgNoun = isRE ? 'agency' : 'dealer'
  const orgNounPlural = isRE ? 'agencies' : 'dealers'
  const [codes, setCodes]       = useState<AffiliateCode[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState({
    owner_name: '', owner_email: '', type: 'advisor', notes: '',
    commission_first_pct: 10, commission_recurring_pct: 2,
  })

  // Inline edit state
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editForm, setEditForm]       = useState<EditForm | null>(null)
  const [editSaving, setEditSaving]   = useState(false)
  const [editError, setEditError]     = useState('')

  // Invite rep state
  const [inviting, setInviting]         = useState<string | null>(null)
  const [inviteForm, setInviteForm]     = useState({ email: '', display_name: '', password: '' })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteMsg, setInviteMsg]       = useState('')

  // Transfer state
  const [transferring, setTransferring]   = useState<string | null>(null)
  const [transferTo, setTransferTo]       = useState('')
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferMsg, setTransferMsg]     = useState('')

  async function load(options?: { showSpinner?: boolean }) {
    if (options?.showSpinner !== false) setLoading(true)
    const res = await fetch('/api/admin/affiliates')
    if (res.ok) {
      const data = await res.json()
      setCodes(data.affiliates ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const res = await fetch('/api/admin/affiliates')
      if (!res.ok || cancelled) return

      const data = await res.json()
      if (cancelled) return

      setCodes(data.affiliates ?? [])
      setLoading(false)
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  async function createCode(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/affiliates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: form.type,
        owner_name: form.owner_name,
        owner_email: form.owner_email || null,
        notes: form.notes || null,
        commission_first_pct: Number(form.commission_first_pct),
        commission_recurring_pct: Number(form.commission_recurring_pct),
        // no code → auto-generated
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to create'); setSaving(false); return }
    setShowForm(false)
    setForm({ owner_name: '', owner_email: '', type: 'advisor', notes: '', commission_first_pct: 10, commission_recurring_pct: 2 })
    await load()
    setSaving(false)
  }

  async function handleInvite(code: string) {
    setInviteSaving(true)
    setInviteMsg('')
    const res = await fetch(`/api/admin/affiliates/${code}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    const data = await res.json()
    if (!res.ok) { setInviteMsg(`Error: ${data.error}`); setInviteSaving(false); return }
    setInviteMsg(data.invited
      ? `Invite sent to ${inviteForm.email}`
      : `Account created for ${inviteForm.email}`)
    setInviting(null)
    setInviteForm({ email: '', display_name: '', password: '' })
    setInviteSaving(false)
  }

  async function handleTransfer(fromCode: string) {
    if (!transferTo.trim()) return
    setTransferSaving(true)
    setTransferMsg('')
    const res = await fetch(`/api/admin/affiliates/${fromCode}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_code: transferTo.trim().toUpperCase() }),
    })
    const data = await res.json()
    if (!res.ok) { setTransferMsg(`Error: ${data.error}`); setTransferSaving(false); return }
    setTransferMsg(`Transferred ${data.orgs_transferred} ${orgNounPlural} to ${data.to_code}`)
    setTransferring(null)
    setTransferTo('')
    await load()
    setTransferSaving(false)
  }

  function startEdit(c: AffiliateCode) {
    setEditingCode(c.code)
    setEditForm({
      owner_name:               c.owner_name,
      owner_email:              c.owner_email ?? '',
      type:                     c.type,
      notes:                    c.notes ?? '',
      commission_first_pct:     c.commission_first_pct,
      commission_recurring_pct: c.commission_recurring_pct,
      is_active:                c.is_active,
    })
    setEditError('')
  }

  async function saveEdit(code: string) {
    if (!editForm) return
    setEditSaving(true)
    setEditError('')
    const res = await fetch(`/api/admin/affiliates/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_name:               editForm.owner_name,
        owner_email:              editForm.owner_email || null,
        type:                     editForm.type,
        notes:                    editForm.notes || null,
        commission_first_pct:     Number(editForm.commission_first_pct),
        commission_recurring_pct: Number(editForm.commission_recurring_pct),
        is_active:                editForm.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setEditError(data.error ?? 'Failed to save'); setEditSaving(false); return }
    setEditingCode(null)
    setEditForm(null)
    await load()
    setEditSaving(false)
  }

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://dealerwyze.com'

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{codes.length} affiliate code{codes.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: '#0D2B55' }}
        >
          <Plus className="w-4 h-4" /> Add salesperson
        </button>
      </div>

      {showForm && (
        <form onSubmit={createCode} className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-sm">New affiliate code</span>
            <button type="button" onClick={() => setShowForm(false)} title="Discard and close form"><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <p className="text-xs text-gray-500">Code will be auto-generated (AFF-XXXX format)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Name *</label>
              <input value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                required className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Sarah Johnson" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Email</label>
              <input type="email" value={form.owner_email} onChange={e => setForm(f => ({ ...f, owner_email: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="sarah@example.com" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({
                ...f, type: e.target.value,
                commission_recurring_pct: e.target.value === 'advisor' ? 2 : 0,
              }))} className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm">
                <option value="advisor">Advisor (recurring)</option>
                <option value="flyer">Flyer (first month only)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">First month %</label>
              <input type="number" min={0} max={100} value={form.commission_first_pct}
                onChange={e => setForm(f => ({ ...f, commission_first_pct: Number(e.target.value) }))}
                className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Recurring %</label>
              <input type="number" min={0} max={100} value={form.commission_recurring_pct}
                onChange={e => setForm(f => ({ ...f, commission_recurring_pct: Number(e.target.value) }))}
                className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm"
                disabled={form.type === 'flyer'} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: '#0D2B55' }}>
            {saving ? 'Creating…' : 'Create affiliate'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {codes.map(c => (
          <div key={c.code} className="border rounded-xl p-4 bg-white">
            {/* View mode */}
            {editingCode !== c.code && (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono font-bold text-base text-blue-700">{c.code}</code>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.type === 'advisor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>{c.type}</span>
                      {!c.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">inactive</span>}
                    </div>
                    <p className="text-sm font-medium mt-0.5">{c.owner_name}</p>
                    {c.owner_email && <p className="text-xs text-gray-500">{c.owner_email}</p>}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="text-right text-xs text-gray-500 space-y-1">
                      <div className="flex items-center gap-1 justify-end">
                        <Users className="w-3 h-3" />
                        <span>{c.active_dealer_count} active {c.active_dealer_count !== 1 ? orgNounPlural : orgNoun}</span>
                      </div>
                      <div>{c.commission_first_pct}% first · {c.commission_recurring_pct}% recurring</div>
                    </div>
                    <button
                      onClick={() => startEdit(c)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title="Edit name, email, commission rates, or deactivate this code"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <Link
                      href={`/admin/affiliates/${c.code}`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      title={`View affiliate details — ${orgNounPlural}, portal account, commissions`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-gray-500 mb-1">Signup URL:</p>
                  <code className="text-xs bg-gray-50 border rounded px-2 py-1 block break-all">
                    {appUrl}/signup?ref={c.code}
                  </code>
                </div>
                {c.notes && <p className="mt-2 text-xs text-gray-400 italic">{c.notes}</p>}
                {/* Admin actions */}
                <div className="mt-3 pt-3 border-t flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setInviting(c.code); setInviteMsg('') }}
                    title="Create a login account for this salesperson so they can access the sales portal"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-blue-50 hover:border-blue-300 text-gray-600 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Invite rep
                  </button>
                  <button
                    onClick={() => { setTransferring(c.code); setTransferMsg('') }}
                    title={`Move all ${orgNounPlural} attributed to this code to a different rep — use when a salesperson leaves`}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-orange-50 hover:border-orange-300 text-gray-600 transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer {orgNounPlural}
                  </button>
                </div>

                {/* Invite rep inline form */}
                {inviting === c.code && (
                  <div className="mt-3 pt-3 border-t space-y-3 bg-blue-50 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-blue-800">Invite salesperson to portal</span>
                      <button onClick={() => setInviting(null)} title="Cancel — close invite form"><X className="w-4 h-4 text-gray-400" /></button>
                    </div>
                    <p className="text-xs text-blue-700">
                      Set a password to create the account immediately, or leave blank to send an invite email.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Email *</label>
                        <input type="email" value={inviteForm.email}
                          onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                          className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="rep@email.com" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Display name *</label>
                        <input value={inviteForm.display_name}
                          onChange={e => setInviteForm(f => ({ ...f, display_name: e.target.value }))}
                          className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Sarah Johnson" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Password (optional — blank = send email invite)</label>
                      <input type="password" value={inviteForm.password}
                        onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                        className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Leave blank to send invite" />
                    </div>
                    {inviteMsg && <p className={`text-xs ${inviteMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{inviteMsg}</p>}
                    <button onClick={() => handleInvite(c.code)} disabled={inviteSaving || !inviteForm.email || !inviteForm.display_name}
                      title={inviteForm.password ? 'Create account immediately with the password you entered' : 'Send an email invite — rep sets their own password'}
                      className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                      style={{ backgroundColor: '#0D2B55' }}>
                      {inviteSaving ? 'Sending…' : inviteForm.password ? 'Create account' : 'Send invite email'}
                    </button>
                  </div>
                )}

                {/* Transfer dealers inline form */}
                {transferring === c.code && (
                  <div className="mt-3 pt-3 border-t space-y-3 bg-orange-50 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-orange-800">Transfer all {orgNounPlural} to another rep</span>
                      <button onClick={() => setTransferring(null)} title="Cancel — close transfer form"><X className="w-4 h-4 text-gray-400" /></button>
                    </div>
                    <p className="text-xs text-orange-700">
                      All organizations with code <strong>{c.code}</strong> (and their pending commissions) will be reassigned. This code will be deactivated.
                    </p>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Destination code *</label>
                      <input value={transferTo}
                        onChange={e => setTransferTo(e.target.value.toUpperCase())}
                        className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm font-mono" placeholder="AFF-XXXX" />
                    </div>
                    {transferMsg && <p className={`text-xs ${transferMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{transferMsg}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => setTransferring(null)} title="Cancel — no changes made"
                        className="flex-1 py-2 rounded-lg text-sm border font-medium hover:bg-white">Cancel</button>
                      <button onClick={() => handleTransfer(c.code)} disabled={transferSaving || !transferTo.trim()}
                        title={`Transfer all ${orgNounPlural} and pending commissions to the destination code, then deactivate this code`}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: '#d97706' }}>
                        {transferSaving ? 'Transferring…' : 'Transfer & deactivate'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Edit mode */}
            {editingCode === c.code && editForm && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <code className="font-mono font-bold text-blue-700">{c.code}</code>
                  <button onClick={() => { setEditingCode(null); setEditForm(null) }} title="Discard changes and close editor">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Name *</label>
                    <input value={editForm.owner_name}
                      onChange={e => setEditForm(f => f ? { ...f, owner_name: e.target.value } : f)}
                      required className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Email</label>
                    <input type="email" value={editForm.owner_email}
                      onChange={e => setEditForm(f => f ? { ...f, owner_email: e.target.value } : f)}
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Type</label>
                    <select value={editForm.type}
                      onChange={e => setEditForm(f => f ? {
                        ...f, type: e.target.value,
                        commission_recurring_pct: e.target.value === 'flyer' ? 0 : f.commission_recurring_pct,
                      } : f)}
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm">
                      <option value="advisor">Advisor</option>
                      <option value="flyer">Flyer</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">First month %</label>
                    <input type="number" min={0} max={100} value={editForm.commission_first_pct}
                      onChange={e => setEditForm(f => f ? { ...f, commission_first_pct: Number(e.target.value) } : f)}
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Recurring %</label>
                    <input type="number" min={0} max={100} value={editForm.commission_recurring_pct}
                      onChange={e => setEditForm(f => f ? { ...f, commission_recurring_pct: Number(e.target.value) } : f)}
                      disabled={editForm.type === 'flyer'}
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm disabled:opacity-40" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Notes</label>
                  <input value={editForm.notes}
                    onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)}
                    className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                {/* Active toggle */}
                <button
                  type="button"
                  onClick={() => setEditForm(f => f ? { ...f, is_active: !f.is_active } : f)}
                  title="Toggle whether this affiliate code is active. Inactive codes do not earn commissions."
                  className="flex items-center gap-2 text-sm"
                >
                  {editForm.is_active
                    ? <ToggleRight className="w-5 h-5 text-green-600" />
                    : <ToggleLeft  className="w-5 h-5 text-gray-400" />}
                  <span className={editForm.is_active ? 'text-green-700' : 'text-gray-500'}>
                    {editForm.is_active ? 'Active' : 'Inactive'}
                  </span>
                </button>
                {editError && <p className="text-xs text-red-600">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setEditingCode(null); setEditForm(null) }}
                    title="Discard all changes"
                    className="flex-1 py-2 rounded-lg text-sm border font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={() => saveEdit(c.code)} disabled={editSaving}
                    title="Save all changes to this affiliate code"
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ backgroundColor: '#0D2B55' }}>
                    {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {codes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No affiliate codes yet. Add a salesperson above.</p>
        )}
      </div>
    </div>
  )
}

// ── Commissions Tab ────────────────────────────────────────────────────────────

function CommissionsTab() {
  const [commissions, setCommissions] = useState<CommissionSummary[]>([])
  const [minPayout, setMinPayout]     = useState(25)
  const [loading, setLoading]         = useState(true)
  const [payingCode, setPayingCode]   = useState<string | null>(null)
  const [payForm, setPayForm]         = useState({ paid_via: 'venmo', payment_reference: '' })
  const [payError, setPayError]       = useState('')
  const [paySuccess, setPaySuccess]   = useState('')

  async function load(options?: { showSpinner?: boolean }) {
    if (options?.showSpinner !== false) setLoading(true)
    const res = await fetch('/api/admin/commissions')
    if (res.ok) {
      const data = await res.json()
      setCommissions(data.commissions ?? [])
      setMinPayout(data.min_payout ?? 25)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitial() {
      const res = await fetch('/api/admin/commissions')
      if (!res.ok || cancelled) return

      const data = await res.json()
      if (cancelled) return

      setCommissions(data.commissions ?? [])
      setMinPayout(data.min_payout ?? 25)
      setLoading(false)
    }

    void loadInitial()
    return () => {
      cancelled = true
    }
  }, [])

  async function handlePayout(affiliateCode: string) {
    setPayError('')
    setPaySuccess('')
    const res = await fetch(`/api/admin/commissions/${affiliateCode}/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payForm),
    })
    const data = await res.json()
    if (!res.ok) { setPayError(data.error ?? 'Failed'); return }
    setPaySuccess(`Paid $${data.total_paid.toFixed(2)} to ${affiliateCode} via ${data.paid_via}`)
    setPayingCode(null)
    setPayForm({ paid_via: 'venmo', payment_reference: '' })
    await load()
  }

  if (loading) return <LoadingSpinner />

  const totalPending = commissions.reduce((s, c) => s + c.pending_balance, 0)
  const totalPaid    = commissions.reduce((s, c) => s + c.all_time_paid, 0)

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending', value: `$${totalPending.toFixed(2)}`, icon: Clock, color: 'text-orange-600' },
          { label: 'All-time paid', value: `$${totalPaid.toFixed(2)}`, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Min payout', value: `$${minPayout}`, icon: DollarSign, color: 'text-blue-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="border rounded-xl p-3 bg-white text-center">
            <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
            <p className="text-lg font-bold">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {paySuccess && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          {paySuccess}
        </div>
      )}

      {/* Per-affiliate cards */}
      <div className="space-y-3">
        {commissions.map(c => (
          <div key={c.affiliate_code} className="border rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold text-blue-700">{c.affiliate_code}</code>
                  <span className="text-xs text-gray-500">{c.type}</span>
                </div>
                <p className="text-sm font-medium">{c.owner_name}</p>
                {c.owner_email && <p className="text-xs text-gray-400">{c.owner_email}</p>}
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${c.pending_balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  ${c.pending_balance.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">pending</p>
                {c.all_time_paid > 0 && (
                  <p className="text-xs text-green-600 mt-0.5">${c.all_time_paid.toFixed(2)} paid total</p>
                )}
              </div>
            </div>

            {/* Payout action */}
            {c.is_payable && payingCode !== c.affiliate_code && (
              <button
                onClick={() => { setPayingCode(c.affiliate_code); setPayError(''); setPaySuccess('') }}
                title={`Mark all pending commissions for ${c.owner_name} as paid. You will record the payment method and reference number.`}
                className="mt-3 w-full py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#0D2B55' }}
              >
                Pay out ${c.pending_balance.toFixed(2)}
              </button>
            )}
            {!c.is_payable && c.pending_balance > 0 && (
              <p className="mt-3 text-xs text-gray-400 text-center">
                ${(minPayout - c.pending_balance).toFixed(2)} more needed to reach ${minPayout} minimum
              </p>
            )}

            {/* Payout form */}
            {payingCode === c.affiliate_code && (
              <div className="mt-3 pt-3 border-t space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Paid via</label>
                    <select value={payForm.paid_via}
                      onChange={e => setPayForm(f => ({ ...f, paid_via: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm capitalize">
                      {PAID_VIA_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Reference / txn ID</label>
                    <input value={payForm.payment_reference}
                      onChange={e => setPayForm(f => ({ ...f, payment_reference: e.target.value }))}
                      placeholder="@handle or txn#"
                      className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                </div>
                {payError && <p className="text-xs text-red-600">{payError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setPayingCode(null)}
                    title="Cancel — go back without recording a payout"
                    className="flex-1 py-2 rounded-lg text-sm border font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={() => handlePayout(c.affiliate_code)}
                    title="Mark all pending commissions as paid and record the payment method and reference"
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: '#059669' }}>
                    Confirm — Mark Paid
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {commissions.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No commissions recorded yet.</p>
        )}
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )
}
