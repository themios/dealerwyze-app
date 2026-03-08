'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'done' | 'error'

export default function SyncInventoryButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setStatus('loading')
    setResult(null)
    const maxTries = 2
    for (let tryNum = 1; tryNum <= maxTries; tryNum++) {
      try {
        const res = await fetch('/api/inventory/sync', { method: 'POST' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Sync failed')

        const parts: string[] = []
        if (data.added > 0) parts.push(`+${data.added} added`)
        if (data.needs_review > 0) parts.push(`${data.needs_review} need review`)
        setResult(parts.length > 0 ? parts.join(' · ') : 'Up to date')
        setStatus('done')
        router.refresh()
        setTimeout(() => { setStatus('idle'); setResult(null) }, 4000)
        return
      } catch (err: any) {
        const isNetworkError = err?.message === 'Failed to fetch'
        if (isNetworkError && tryNum < maxTries) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        const message = isNetworkError
          ? 'Connection interrupted. Check your internet and try again.'
          : (err?.message || 'Sync failed. Check your inventory URL in Settings → Organization.')
        setResult(message)
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
      title="Pull latest vehicles from your dealership website into this list"
    >
      {status === 'loading' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
      {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
      {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      {status === 'idle' && <RefreshCw className="h-3.5 w-3.5" />}
      {result ?? 'Sync'}
    </Button>
  )
}
