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
    try {
      const res = await fetch('/api/inventory/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')

      const parts: string[] = []
      if (data.added > 0) parts.push(`+${data.added}`)
      if (data.archived > 0) parts.push(`-${data.archived}`)
      setResult(parts.length > 0 ? parts.join(' ') : 'Up to date')
      setStatus('done')
      router.refresh()
    } catch (err: any) {
      setResult('Failed')
      setStatus('error')
      console.error(err)
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
    >
      {status === 'loading' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
      {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
      {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
      {status === 'idle' && <RefreshCw className="h-3.5 w-3.5" />}
      {result ?? 'Sync'}
    </Button>
  )
}
