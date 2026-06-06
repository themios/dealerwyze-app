'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'done' | 'error'
type SyncResponse = {
  synced?: number
  error?: string
  message?: string
}

export default function SyncMLSButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setStatus('loading')
    setResult(null)
    const maxTries = 2
    for (let tryNum = 1; tryNum <= maxTries; tryNum++) {
      try {
        const res = await fetch('/api/integrations/mls/sync', { method: 'POST' })
        const data: SyncResponse = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'MLS sync failed')

        const parts: string[] = []
        if ((data.synced ?? 0) > 0) parts.push(`+${data.synced} synced`)
        setResult(parts.length > 0 ? parts.join(' · ') : 'Up to date')
        setStatus('done')
        router.refresh()
        setTimeout(() => { setStatus('idle'); setResult(null) }, 4000)
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        const isNetworkError = message === 'Failed to fetch'
        if (isNetworkError && tryNum < maxTries) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        const errorMessage = isNetworkError
          ? 'Connection interrupted. Check your internet and try again.'
          : (message || 'MLS sync failed. Check your MLS connection in Settings.')
        setResult(errorMessage)
        setStatus('error')
        if (!isNetworkError) console.error(err)
        break
      }
    }
    setTimeout(() => { setStatus('idle'); setResult(null) }, 4000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 px-3 text-xs gap-1.5"
      onClick={handleSync}
      disabled={status === 'loading'}
      title="Pull latest listings from your MLS into this list"
    >
      {status === 'loading' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
      {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
      {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      {status === 'idle' && <RefreshCw className="h-3.5 w-3.5" />}
      {result ?? 'Sync MLS'}
    </Button>
  )
}
