'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import ConnectorCard from '@/components/admin/settings/social/ConnectorCard'

type ConnectorRow = {
  id: string
  connector_key: string
  display_name: string
  app_id: string | null
  callback_url: string | null
  required_scopes: string[]
  enabled: boolean
  enabled_for_plans: string[]
  updated_at: string
  updated_by: string | null
}

type AccountRow = {
  id: string
  platform: string
  account_label: string
  platform_account_id: string
  is_active: boolean
  token_expires_at: string | null
  last_used_at: string | null
  last_error: string | null
  last_error_at: string | null
  created_at: string
}

interface SocialConnectorClientProps {
  connectors: ConnectorRow[]
  accounts: AccountRow[]
}

function tokenStatus(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) {
    return { label: 'No expiry', className: 'bg-white/15 text-white/70' }
  }

  const now = Date.now()
  const expiresAt = new Date(tokenExpiresAt).getTime()
  if (Number.isNaN(expiresAt)) {
    return { label: 'No expiry', className: 'bg-white/15 text-white/70' }
  }
  if (expiresAt < now) {
    return { label: 'Expired', className: 'bg-red-500/20 text-red-300' }
  }
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000
  if (expiresAt < sevenDaysFromNow) {
    return { label: 'Expiring soon', className: 'bg-yellow-500/20 text-yellow-300' }
  }
  return { label: 'Active', className: 'bg-green-500/20 text-green-300' }
}

function timeAgo(value: string | null) {
  if (!value) return 'never'
  const date = new Date(value).getTime()
  if (Number.isNaN(date)) return 'never'
  const diff = Date.now() - date
  if (diff < 60_000) return 'just now'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function SocialConnectorClient({ connectors, accounts }: SocialConnectorClientProps) {
  const searchParams = useSearchParams()
  const [connectorRows, setConnectorRows] = useState<ConnectorRow[]>(connectors)
  const [localAccounts, setLocalAccounts] = useState<AccountRow[]>(accounts)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  const connectedPlatform = searchParams.get('connected')
  const oauthError = searchParams.get('error')
  const oauthErrorMessage = oauthError === 'user_denied'
    ? 'Connection cancelled.'
    : oauthError === 'invalid_state'
      ? 'OAuth state invalid. Please try again.'
      : oauthError === 'token_exchange_failed'
        ? 'Token exchange failed. Check Meta app credentials.'
        : oauthError
          ? 'Connection failed. Please try again.'
          : null

  async function handleConnectMeta() {
    setConnecting(true)
    setConnectError(null)
    try {
      const res = await fetch('/api/admin/social/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'facebook' }),
      })
      const payload = await res.json()
      if (!res.ok || !payload.url) throw new Error(payload.error ?? 'Failed')
      window.location.href = payload.url
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Connection failed')
      setConnecting(false)
    }
  }

  async function handleToggleActive(id: string, is_active: boolean) {
    const res = await fetch(`/api/admin/social/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      setConnectError(payload?.error ?? 'Could not update account status')
      return
    }
    setLocalAccounts(prev =>
      prev.map(account => (account.id === id ? { ...account, is_active } : account))
    )
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Remove this platform account? This cannot be undone.')) return
    const res = await fetch(`/api/admin/social/accounts/${id}`, { method: 'DELETE' })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      setConnectError(payload?.error ?? 'Could not remove account')
      return
    }
    setLocalAccounts(prev => prev.filter(account => account.id !== id))
  }

  return (
    <div className="p-6 max-w-4xl bg-[#07131F] min-h-full text-white space-y-10">
      <section>
        <SectionHeader
          title="Platform Connectors"
          description="OAuth app credentials and plan availability for each social platform."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectorRows.map(connector => (
            <ConnectorCard
              key={connector.connector_key}
              connector={connector}
              onSaved={updated =>
                setConnectorRows(prev =>
                  prev.map(item => (item.connector_key === updated.connector_key ? { ...item, ...updated } : item))
                )
              }
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Platform Accounts"
          description="DealerWyze's own connected social accounts for content publishing."
        />
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                void handleConnectMeta()
              }}
              disabled={connecting}
              className="bg-[#1877F2] hover:bg-[#1877F2]/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {connecting ? <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              Connect Meta (Facebook + Instagram)
            </button>
            <button disabled className="bg-white/10 text-white/30 px-4 py-2 rounded-lg text-sm cursor-not-allowed">
              TikTok — Coming soon
            </button>
            <button disabled className="bg-white/10 text-white/30 px-4 py-2 rounded-lg text-sm cursor-not-allowed">
              YouTube — Coming soon
            </button>
          </div>
          {connectedPlatform ? <div className="text-green-300 text-sm">Connected successfully</div> : null}
          {oauthErrorMessage ? <div className="text-red-400 text-sm">{oauthErrorMessage}</div> : null}
          {connectError ? <p className="text-red-400 text-sm">{connectError}</p> : null}

          {localAccounts.length > 0 ? (
            <div className="space-y-2 mt-4">
              {localAccounts.map(account => {
                const tokenBadge = tokenStatus(account.token_expires_at)
                return (
                  <div
                    key={account.id}
                    className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 flex items-center gap-4"
                  >
                    <p className="text-white font-medium w-28 capitalize">{account.platform}</p>
                    <p className="text-white/60 text-sm flex-1">{account.account_label}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${tokenBadge.className}`}>
                      {tokenBadge.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        account.is_active ? 'bg-green-500/20 text-green-300' : 'bg-white/15 text-white/70'
                      }`}
                    >
                      {account.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {account.last_error ? (
                      <span title={account.last_error}>
                        <AlertTriangle className="h-4 w-4 text-orange-300" />
                      </span>
                    ) : null}
                    <p className="text-white/30 text-xs">Last used {timeAgo(account.last_used_at)}</p>
                    <button
                      onClick={() => {
                        void handleToggleActive(account.id, !account.is_active)
                      }}
                      className="text-xs text-white/40 hover:text-white/70 px-3 py-1 border border-white/10 rounded-md"
                    >
                      {account.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => {
                        void handleRemove(account.id)
                      }}
                      className="text-xs text-red-400/60 hover:text-red-300 px-3 py-1 border border-red-500/20 rounded-md"
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-white/40 text-sm">No platform accounts connected yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
