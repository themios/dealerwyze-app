'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  Briefcase, TrendingUp, TrendingDown, AlertCircle,
  DollarSign, Users, ChevronRight, Mail, ArrowUpDown,
  Plus, CheckCircle2, Pencil, X, Save,
} from 'lucide-react'

interface Salesperson {
  code: string
  type: 'flyer' | 'advisor'
  owner_name: string
  owner_email: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  commission_first_pct: number
  commission_recurring_pct: number
  total_customers: number
  active_customers: number
  critical: number
  at_risk: number
  healthy: number
  avg_score: number
  retention_rate: number
  performance_score: number
  commission_pending: number
  commission_paid: number
}

type SortKey = 'performance' | 'customers' | 'risk' | 'commission'

function PerformanceBar({ score }: { score: number }) {
  const color = score >= 65 ? 'bg-green-500' : score >= 35 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold w-7 text-right tabular-nums">{score}</span>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold border ${
      type === 'advisor'
        ? 'bg-purple-100 text-purple-700 border-purple-200'
        : 'bg-blue-100 text-blue-700 border-blue-200'
    }`}>
      {type === 'advisor' ? 'Advisor' : 'Flyer'}
    </span>
  )
}

export default function AdminSalesPage() {
  const router = useRouter()
  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  const [loading, setLoading]         = useState(true)
  const [sort, setSort]               = useState<SortKey>('performance')
  const [editingCode, setEditingCode]   = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<Partial<Salesperson> | null>(null)
  const [editSaving, setEditSaving]     = useState(false)
  const [editError, setEditError]       = useState('')

  useEffect(() => {
    fetch('/api/admin/sales')
      .then(r => r.json())
      .then((d: { salespeople: Salesperson[] }) => setSalespeople(d.salespeople ?? []))
      .finally(() => setLoading(false))
  }, [])

  const sorted = useMemo(() => {
    const list = [...salespeople]
    if (sort === 'performance') list.sort((a, b) => b.performance_score - a.performance_score)
    else if (sort === 'customers') list.sort((a, b) => b.total_customers - a.total_customers)
    else if (sort === 'risk') list.sort((a, b) => (b.critical * 2 + b.at_risk) - (a.critical * 2 + a.at_risk))
    else if (sort === 'commission') list.sort((a, b) => b.commission_pending - a.commission_pending)
    return list
  }, [salespeople, sort])

  const totals = useMemo(() => ({
    team:       salespeople.length,
    customers:  salespeople.reduce((s, p) => s + p.total_customers, 0),
    critical:   salespeople.reduce((s, p) => s + p.critical, 0),
    at_risk:    salespeople.reduce((s, p) => s + p.at_risk, 0),
    commission: salespeople.reduce((s, p) => s + p.commission_pending, 0),
  }), [salespeople])


  function startEdit(sp: Salesperson, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingCode(sp.code)
    setEditForm({
      owner_name:               sp.owner_name,
      owner_email:              sp.owner_email ?? '',
      type:                     sp.type,
      notes:                    sp.notes ?? '',
      commission_first_pct:     sp.commission_first_pct,
      commission_recurring_pct: sp.commission_recurring_pct,
      is_active:                sp.is_active,
    })
    setEditError('')
  }

  async function saveEdit() {
    if (!editingCode || !editForm) return
    setEditSaving(true)
    setEditError('')
    const res = await fetch(`/api/admin/affiliates/${encodeURIComponent(editingCode)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_name:               String(editForm.owner_name ?? '').trim(),
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
    setSalespeople(prev => prev.map(s => s.code === editingCode ? { ...s, ...editForm, owner_name: String(editForm.owner_name ?? s.owner_name), owner_email: editForm.owner_email as string | null } : s))
    setEditingCode(null)
    setEditForm(null)
    setEditSaving(false)
  }

  return (
    <div>
      <TopBar title="Sales Team" />
      <div className="px-4 py-4 lg:px-6 space-y-5 max-w-4xl">

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Salespeople',      value: totals.team,                            icon: Briefcase,    color: '' },
            { label: 'Total Customers',  value: totals.customers,                       icon: Users,        color: '' },
            { label: 'Critical',         value: totals.critical,                        icon: TrendingDown, color: totals.critical > 0 ? 'text-red-600' : '' },
            { label: 'At Risk',          value: totals.at_risk,                         icon: AlertCircle,  color: totals.at_risk > 0  ? 'text-yellow-600' : '' },
            { label: 'Pending Comm.',    value: `$${totals.commission.toFixed(0)}`,      icon: DollarSign,   color: 'text-green-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3.5 w-3.5 ${color || 'text-muted-foreground'}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Sort + Add */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border bg-card overflow-hidden">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground ml-2.5" />
            {(['performance', 'customers', 'risk', 'commission'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                  sort === s ? 'bg-[#0D2B55] text-white' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {s === 'performance' ? 'Top Performers' : s === 'customers' ? 'Most Customers' : s === 'risk' ? 'Most At-Risk' : 'Commission'}
              </button>
            ))}
          </div>
          <Link
            href="/admin/affiliates"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D2B55] text-white text-xs font-medium hover:bg-[#1a4480] transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Salesperson
          </Link>
        </div>

        {/* Salesperson list */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading sales team…</p>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center space-y-3">
            <Briefcase className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="font-medium">No salespeople yet</p>
            <p className="text-sm text-muted-foreground">Create affiliate codes to start tracking sales team performance.</p>
            <Link href="/admin/affiliates" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0D2B55] text-white text-sm font-medium">
              <Plus className="h-4 w-4" /> Create First Code
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((sp, rank) => (
              <button
                key={sp.code}
                onClick={() => router.push(`/admin/sales/${encodeURIComponent(sp.code)}`)}
                className="w-full text-left rounded-xl border bg-card hover:bg-accent/30 transition-colors overflow-hidden"
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Rank circle */}
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                        rank === 0 ? 'bg-yellow-100 text-yellow-700' :
                        rank === 1 ? 'bg-gray-200 text-gray-700' :
                        rank === 2 ? 'bg-orange-100 text-orange-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        #{rank + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{sp.owner_name}</span>
                          <TypeBadge type={sp.type} />
                          {!sp.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{sp.code}</span>
                          {sp.owner_email && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Mail className="h-2.5 w-2.5" />{sp.owner_email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={e => startEdit(sp, e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Edit salesperson"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                    </div>
                  </div>

                  {/* Performance bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Performance Score</span>
                      <span className="text-[10px] text-muted-foreground">Retention {sp.retention_rate}%</span>
                    </div>
                    <PerformanceBar score={sp.performance_score} />
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-muted/40 py-2">
                      <p className="text-sm font-bold">{sp.total_customers}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className={`rounded-lg py-2 ${sp.critical > 0 ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/40'}`}>
                      <p className={`text-sm font-bold ${sp.critical > 0 ? 'text-red-600' : ''}`}>{sp.critical}</p>
                      <p className="text-[10px] text-muted-foreground">Critical</p>
                    </div>
                    <div className={`rounded-lg py-2 ${sp.at_risk > 0 ? 'bg-yellow-50 dark:bg-yellow-950/20' : 'bg-muted/40'}`}>
                      <p className={`text-sm font-bold ${sp.at_risk > 0 ? 'text-yellow-600' : ''}`}>{sp.at_risk}</p>
                      <p className="text-[10px] text-muted-foreground">At Risk</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 py-2">
                      <p className={`text-sm font-bold ${sp.commission_pending >= 25 ? 'text-green-600' : ''}`}>
                        ${sp.commission_pending.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Pending $</p>
                    </div>
                  </div>

                  {/* Avg health */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Avg customer health:</span>
                    <span className={`text-[10px] font-semibold ${
                      sp.avg_score >= 65 ? 'text-green-600' : sp.avg_score >= 35 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{sp.avg_score}/100</span>
                    {sp.critical === 0 && sp.at_risk === 0 && (
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-green-600">
                        <CheckCircle2 className="h-3 w-3" /> All healthy
                      </span>
                    )}
                    {(sp.critical > 0 || sp.at_risk > 0) && (
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-orange-500">
                        <TrendingDown className="h-3 w-3" />
                        {sp.critical + sp.at_risk} need attention
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}


        {/* Edit modal */}
        {editingCode && editForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">Edit Salesperson</h2>
                <button onClick={() => setEditingCode(null)} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Name *</label>
                  <input
                    value={editForm.owner_name ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, owner_name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                    placeholder="Full name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={editForm.owner_email ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, owner_email: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <select
                    value={editForm.type ?? 'flyer'}
                    onChange={e => setEditForm(f => ({
                      ...f, type: e.target.value as 'flyer' | 'advisor',
                      commission_recurring_pct: e.target.value === 'advisor' ? (f?.commission_recurring_pct ?? 2) : 0,
                    }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                  >
                    <option value="advisor">Advisor (recurring)</option>
                    <option value="flyer">Flyer (first month only)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    value={editForm.is_active ? 'active' : 'inactive'}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">First month %</label>
                  <input
                    type="number" min={0} max={100}
                    value={editForm.commission_first_pct ?? 10}
                    onChange={e => setEditForm(f => ({ ...f, commission_first_pct: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Recurring %</label>
                  <input
                    type="number" min={0} max={100}
                    value={editForm.commission_recurring_pct ?? 0}
                    onChange={e => setEditForm(f => ({ ...f, commission_recurring_pct: Number(e.target.value) }))}
                    disabled={editForm.type === 'flyer'}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background disabled:opacity-40"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <input
                    value={editForm.notes ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-background"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {editError && <p className="text-xs text-red-500">{editError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0D2B55] text-white text-sm font-medium disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  onClick={() => setEditingCode(null)}
                  className="px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
