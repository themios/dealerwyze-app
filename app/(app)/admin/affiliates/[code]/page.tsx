'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import {
  ArrowLeft, User, Users, DollarSign, Clock, CheckCircle2,
  ExternalLink, Building2, Loader2, UserPlus, X,
} from 'lucide-react'

interface AffiliateDetail {
  code: string
  type: 'flyer' | 'advisor'
  owner_name: string
  owner_email: string | null
  commission_first_pct: number
  commission_recurring_pct: number
  is_active: boolean
  notes: string | null
  created_at: string
}

interface RepProfile {
  id: string
  display_name: string
  email?: string
  last_sign_in_at?: string
}

interface Dealer {
  id: string
  name: string
  subscription_status: string | null
  created_at: string
}

interface CommissionSummary {
  pending_balance: number
  all_time_paid: number
}

interface DetailData {
  affiliate: AffiliateDetail
  rep_profile: RepProfile | null
  dealers: Dealer[]
  commission_summary: CommissionSummary
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? 'free'
  const map: Record<string, string> = {
    free:        'bg-gray-100 text-gray-600',
    tier1:       'bg-blue-100 text-blue-700',
    tier2:       'bg-purple-100 text-purple-700',
    past_due:    'bg-red-100 text-red-700',
    canceled:    'bg-red-100 text-red-600',
    trialing:    'bg-yellow-100 text-yellow-700',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[s] ?? 'bg-gray-100 text-gray-500'}`}>
      {s}
    </span>
  )
}

export default function AffiliateDetailPage() {
  const { code } = useParams<{ code: string }>()
  const [data, setData]       = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Re-invite form
  const [showInvite, setShowInvite]     = useState(false)
  const [inviteForm, setInviteForm]     = useState({ email: '', display_name: '', password: '' })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteMsg, setInviteMsg]       = useState('')

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/affiliates/${code}`)
    if (!res.ok) { setError('Affiliate not found'); setLoading(false); return }
    const d = await res.json()
    setData(d)
    // Pre-fill invite form with known info
    if (d.affiliate.owner_email) {
      setInviteForm(f => ({ ...f, email: f.email || d.affiliate.owner_email, display_name: f.display_name || d.affiliate.owner_name }))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [code])

  async function handleInvite() {
    setInviteSaving(true)
    setInviteMsg('')
    const res = await fetch(`/api/admin/affiliates/${code}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteForm),
    })
    const d = await res.json()
    if (!res.ok) { setInviteMsg(`Error: ${d.error}`); setInviteSaving(false); return }
    setInviteMsg(d.invited ? `Invite sent to ${inviteForm.email}` : `Account created for ${inviteForm.email}`)
    setShowInvite(false)
    setInviteForm({ email: '', display_name: '', password: '' })
    setInviteSaving(false)
    await load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  if (error || !data) return (
    <div className="max-w-2xl mx-auto p-4">
      <TopBar title="Affiliate" />
      <p className="text-red-600 text-sm mt-4">{error || 'Not found'}</p>
    </div>
  )

  const { affiliate: aff, rep_profile, dealers, commission_summary } = data
  const signupUrl  = `${typeof window !== 'undefined' ? window.location.origin : 'https://dealerwyze.com'}/signup?ref=${aff.code}`
  const portalUrl  = `${typeof window !== 'undefined' ? window.location.origin : 'https://dealerwyze.com'}/sales`

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <TopBar title={aff.owner_name} />

      {/* Back */}
      <Link href="/admin/affiliates" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Affiliates
      </Link>

      {/* Affiliate info card */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <code className="font-mono font-bold text-lg text-blue-700">{aff.code}</code>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                aff.type === 'advisor' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
              }`}>{aff.type}</span>
              {!aff.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">inactive</span>}
            </div>
            <p className="text-sm font-semibold mt-0.5">{aff.owner_name}</p>
            {aff.owner_email && <p className="text-xs text-gray-500">{aff.owner_email}</p>}
          </div>
          <div className="text-right text-xs text-gray-500 space-y-1">
            <div>{aff.commission_first_pct}% first month</div>
            {aff.type === 'advisor' && aff.commission_recurring_pct > 0 && (
              <div>{aff.commission_recurring_pct}% recurring</div>
            )}
          </div>
        </div>
        {aff.notes && <p className="text-xs text-gray-400 italic">{aff.notes}</p>}
        <div>
          <p className="text-xs text-gray-500 mb-1">Signup URL:</p>
          <code className="text-xs bg-gray-50 border rounded px-2 py-1 block break-all">{signupUrl}</code>
        </div>
      </div>

      {/* Commission summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded-xl p-3 bg-white text-center">
          <Clock className="w-5 h-5 mx-auto mb-1 text-orange-500" />
          <p className="text-lg font-bold">${commission_summary.pending_balance.toFixed(2)}</p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
        <div className="border rounded-xl p-3 bg-white text-center">
          <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-500" />
          <p className="text-lg font-bold">${commission_summary.all_time_paid.toFixed(2)}</p>
          <p className="text-xs text-gray-500">All-time paid</p>
        </div>
      </div>

      {/* Portal account */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" /> Portal Account
          </h2>
          {!rep_profile && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-blue-50 hover:border-blue-300 text-gray-600 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" /> Create account
            </button>
          )}
        </div>

        {rep_profile ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">{rep_profile.display_name}</p>
            {rep_profile.email && <p className="text-xs text-gray-500">{rep_profile.email}</p>}
            {rep_profile.last_sign_in_at ? (
              <p className="text-xs text-green-600">
                Last login: {new Date(rep_profile.last_sign_in_at).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-xs text-amber-600">Never logged in</p>
            )}
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
            >
              <ExternalLink className="w-3 h-3" /> Sales portal
            </a>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No portal account yet. Create one so this rep can log in and track their dealers.</p>
        )}

        {/* Create/invite form */}
        {showInvite && (
          <div className="mt-2 pt-3 border-t space-y-3 bg-blue-50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-blue-800">Create portal account</span>
              <button onClick={() => setShowInvite(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <p className="text-xs text-blue-700">
              Set a password to create the account immediately, or leave blank to send an invite email.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Email *</label>
                <input type="email" value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Display name *</label>
                <input value={inviteForm.display_name}
                  onChange={e => setInviteForm(f => ({ ...f, display_name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Password (optional)</label>
              <input type="password" value={inviteForm.password}
                onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-1.5 text-sm" placeholder="Leave blank to send invite email" />
            </div>
            {inviteMsg && <p className={`text-xs ${inviteMsg.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{inviteMsg}</p>}
            <button onClick={handleInvite} disabled={inviteSaving || !inviteForm.email || !inviteForm.display_name}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: '#0D2B55' }}>
              {inviteSaving ? 'Creating…' : inviteForm.password ? 'Create account' : 'Send invite email'}
            </button>
          </div>
        )}
      </div>

      {/* Dealers */}
      <div className="border rounded-xl p-4 bg-white space-y-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          Dealers
          <span className="text-xs font-normal text-gray-400">({dealers.length})</span>
        </h2>
        {dealers.length === 0 ? (
          <p className="text-sm text-gray-400">No dealers have signed up via this code yet.</p>
        ) : (
          <div className="space-y-2">
            {dealers.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <Link href={`/admin/orgs/${d.id}`} className="text-sm font-medium hover:underline text-blue-700">
                    {d.name}
                  </Link>
                  <p className="text-xs text-gray-400">{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={d.subscription_status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
