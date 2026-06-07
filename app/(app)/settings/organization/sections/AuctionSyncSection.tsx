'use client'

import { useEffect, useState } from 'react'
import { AuctionSettingsPanel } from '@/components/settings/AuctionSettingsPanel'
import { toast } from 'sonner'

interface AuctionConfig {
  enabled: boolean
  copart_enabled: boolean
  copart_api_key?: string
  copart_username?: string
  acv_enabled: boolean
  acv_api_key?: string
  last_sync_at?: string
  last_sync_status?: string
  last_sync_count?: number
}

export default function AuctionSyncSection() {
  const [config, setConfig] = useState<AuctionConfig | null>(null)
  const [loading, setLoading] = useState(true)

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch('/api/settings/auction')
        if (!res.ok) throw new Error('Failed to load auction settings')
        const data = await res.json()
        setConfig(data)
      } catch (err) {
        console.error('[AuctionSyncSection]', err)
        toast.error('Failed to load auction settings')
      } finally {
        setLoading(false)
      }
    }

    loadConfig()
  }, [])

  async function handleSave(newConfig: AuctionConfig) {
    const res = await fetch('/api/settings/auction', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Failed to save auction settings')
    }

    const data = await res.json()
    setConfig(data)
  }

  if (loading) {
    return <div className="p-4 text-muted-foreground">Loading auction settings...</div>
  }

  if (!config) {
    return null
  }

  return <AuctionSettingsPanel config={config} onSave={handleSave} />
}
