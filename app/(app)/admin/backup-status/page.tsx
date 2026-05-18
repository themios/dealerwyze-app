'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

type R2Object = {
  Key?: string
  LastModified?: string
  Size?: number
}

type BackupStatus = {
  configured: boolean
  error?: string
  last_daily: R2Object | null
  last_weekly: R2Object | null
  last_monthly: R2Object | null
}

function fmtBytes(n?: number) {
  if (!n || n <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtWhen(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function row(
  label: string,
  o: R2Object | null,
  downloadingKey: string | null,
  onDownload: (key: string) => void,
) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{o?.Key ?? '—'}</div>
      </div>
      <div className="shrink-0 text-right space-y-1">
        <div className="text-sm tabular-nums">{fmtBytes(o?.Size)}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{fmtWhen(o?.LastModified)}</div>
        {o?.Key ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={downloadingKey === o.Key}
            onClick={() => onDownload(o.Key!)}
          >
            {downloadingKey === o.Key ? 'Preparing…' : '↓ Download'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default function BackupStatusPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<BackupStatus | null>(null)
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)

  const configured = data?.configured ?? false
  const err = data?.error

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/backup-status', { cache: 'no-store' })
      const json = await res.json() as BackupStatus
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load')
      }
      setData(json)
    } catch (e) {
      setData(null)
      toast.error(e instanceof Error ? e.message : 'Failed to load backup status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const cards = useMemo(() => ([
    { label: 'Daily', obj: data?.last_daily ?? null },
    { label: 'Weekly', obj: data?.last_weekly ?? null },
    { label: 'Monthly', obj: data?.last_monthly ?? null },
  ]), [data])

  async function download(key: string) {
    setDownloadingKey(key)
    try {
      const res = await fetch(`/api/admin/backup-download?key=${encodeURIComponent(key)}`)
      const json = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Failed to create download URL')
      }
      window.open(json.url, '_blank', 'noreferrer')
      toast.success('Download started. Decrypt with: ./scripts/restore.sh')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setDownloadingKey(null)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Backup Status</h1>
          <p className="text-sm text-muted-foreground">
            Nightly encrypted database backups to Cloudflare R2 (via GitHub Actions).
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" size="sm">
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {!configured && (
        <Card className="border-yellow-300/40 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="text-sm">R2 not configured</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` in Vercel env vars.
          </CardContent>
        </Card>
      )}

      {err && (
        <Card className="border-red-300/40 bg-red-50 dark:bg-red-950/20">
          <CardHeader>
            <CardTitle className="text-sm">Error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{err}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Latest backups</CardTitle>
        </CardHeader>
        <CardContent>
          {cards.map(c => row(c.label, c.obj, downloadingKey, download))}
        </CardContent>
      </Card>

      <Card className="border-slate-200/70 bg-slate-50 dark:bg-slate-950/20">
        <CardContent className="pt-4 text-sm text-muted-foreground">
          <span className="font-medium">ℹ️ Downloaded files are encrypted.</span>{' '}
          To restore: run <span className="font-mono">./scripts/restore.sh</span> from the project root. You will need the backup encryption key from 1Password.
        </CardContent>
      </Card>
    </div>
  )
}

