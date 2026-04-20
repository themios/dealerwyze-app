'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'done' | 'error'

type ErrorDetail = { message: string; reason: string; action: string; code: string; accountEmail?: string }

export default function SyncGmailButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<string | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<ErrorDetail | null>(null)

  async function run(dry = false) {
    setStatus('loading')
    setResult(null)
    setDetails(null)
    setErrorDetail(null)

    try {
      const res = await fetch(dry ? '/api/leads/sync?dry=1' : '/api/leads/sync', { method: 'POST' })
      const text = await res.text()
      let data: { error?: string; errorDetail?: ErrorDetail; results?: unknown[] } = {}
      try { data = JSON.parse(text) } catch {}

      if (!res.ok) {
        if (data.errorDetail && data.errorDetail.code) {
          setErrorDetail(data.errorDetail)
          setResult(data.errorDetail.message)
          const parts = [
            data.errorDetail.accountEmail
              ? `Account: ${data.errorDetail.accountEmail}`
              : null,
            data.errorDetail.reason,
            data.errorDetail.action,
            `If you contact support, give them this code: ${data.errorDetail.code}. It helps us look up what went wrong.`,
          ].filter(Boolean)
          setDetails(parts.join('\n\n'))
        } else {
          setResult(data.error || `Server error ${res.status}`)
        }
        setStatus('error')
        setTimeout(() => { setStatus('idle'); setResult(null); setDetails(null); setErrorDetail(null) }, 12000)
        return
      }

      const all = (data.results ?? []) as any[]
      const newLeads = all.filter((r: any) => r.status === 'created')
      const dupes = all.filter((r: any) => r.status === 'duplicate').length
      const errors = all.filter((r: any) => r.status === 'error')

      if (dry) {
        const parsed = all.filter((r: any) => r.status === 'dry-run')
        const noMatch = all.filter((r: any) => r.status === 'no-match')
        setResult(`DRY: ${parsed.length} parsed, ${noMatch.length} skipped`)
        setDetails([
          ...parsed.map((r: any) => `✓ ${r.name || '?'} <${r.email || '?'}> [${r.source}]`),
          ...noMatch.map((r: any) => `✗ [${r.from}] "${r.subject}"`),
        ].join('\n') || 'Nothing found')
        setStatus('done')
        return
      }

      if (newLeads.length > 0) {
        setResult(`${newLeads.length} new lead${newLeads.length !== 1 ? 's' : ''}`)
        setDetails(newLeads.map((r: any) => `+ ${r.name || r.email}`).join('\n') +
          (dupes > 0 ? `\n${dupes} duplicate(s) skipped` : ''))
        router.refresh()
      } else if (errors.length > 0) {
        setResult('Sync error')
        setDetails(errors.map((r: any) => `✗ ${r.name || r.email}: ${r.status}${r.error ? ' — ' + r.error : ''}`).join('\n'))
      } else {
        setResult('No new leads')
        setDetails(dupes > 0 ? `${dupes} duplicate(s) skipped` : null)
      }
      setStatus('done')
    } catch (err: any) {
      setResult(err.message || 'Sync failed')
      setStatus('error')
    }

    setTimeout(() => {
      setStatus('idle')
      setResult(null)
      setDetails(null)
      setErrorDetail(null)
    }, 8000)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs gap-1.5 text-white/80 hover:text-white hover:bg-white/10"
        onClick={() => run(false)}
        disabled={status === 'loading'}
        title="Check for new lead emails and add them to your leads"
      >
        {status === 'loading' && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
        {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
        {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
        {status === 'idle' && <RefreshCw className="h-3.5 w-3.5" />}
        {result ?? 'Sync Mail'}
      </Button>
      {!compact && details && (
        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap max-w-xs text-right">
          {details}
        </pre>
      )}
    </div>
  )
}
