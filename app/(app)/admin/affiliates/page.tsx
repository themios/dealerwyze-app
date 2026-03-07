'use client'

import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { Plus, DollarSign, Users, CheckCircle2, Clock, Loader2, X } from 'lucide-react'

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

function CodesTab() {
  const [codes, setCodes]     = useState<AffiliateCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({
    owner_name: '', owner_email: '', type: 'advisor', notes: '',
    commission_first_pct: 10, commission_recurring_pct: 2,
  })

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/affiliates')
    if (res.ok) {
      const data = await res.json()
      setCodes(data.affiliates ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
            <button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
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
              <div className="text-right text-xs text-gray-500 space-y-1">
                <div className="flex items-center gap-1 justify-end">
                  <Users className="w-3 h-3" />
                  <span>{c.active_dealer_count} active dealer{c.active_dealer_count !== 1 ? 's' : ''}</span>
                </div>
                <div>{c.commission_first_pct}% first · {c.commission_recurring_pct}% recurring</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">Signup URL:</p>
              <code className="text-xs bg-gray-50 border rounded px-2 py-1 block break-all">
                {appUrl}/signup?ref={c.code}
              </code>
            </div>
            {c.notes && <p className="mt-2 text-xs text-gray-400 italic">{c.notes}</p>}
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

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/commissions')
    if (res.ok) {
      const data = await res.json()
      setCommissions(data.commissions ?? [])
      setMinPayout(data.min_payout ?? 25)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
                    className="flex-1 py-2 rounded-lg text-sm border font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button onClick={() => handlePayout(c.affiliate_code)}
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
