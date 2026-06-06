'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Globe, CheckCircle, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'done' | 'error'
type SyncResponse = {
  synced?: number
  error?: string
}

export default function SyncWebsiteButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setStatus('loading')
    setResult(null)

    try {
      const res = await fetch('/api/listings/sync-website', { method: 'POST' })
      const data: SyncResponse = await res.json().catch(() => ({}))

      if (!res.ok) throw new Error(data.error || 'Website sync failed')

      const parts: string[] = []
      if ((data.synced ?? 0) > 0) parts.push(`+${data.synced} synced`)
      setResult(parts.length > 0 ? parts.join(' · ') : 'Up to date')
      setStatus('done')
      router.refresh()
      setTimeout(() => { setStatus('idle'); setResult(null) }, 4000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      setResult(message)
      setStatus('error')
      console.error(err)
      setTimeout(() => { setStatus('idle'); setResult(null) }, 4000)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 px-3 text-xs gap-1.5"
      onClick={handleSync}
      disabled={status === 'loading'}
      title="Pull latest listings from your website"
    >
      {status === 'loading' && <Globe className="h-3.5 w-3.5 animate-spin" />}
      {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
      {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      {status === 'idle' && <Globe className="h-3.5 w-3.5" />}
      {result ?? 'Sync Website'}
    </Button>
  )
}
