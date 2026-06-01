'use client'

import { useState, useEffect } from 'react'
import { Download } from 'lucide-react'

export default function ExportDataButton() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isRealEstate = typeof window !== 'undefined' && window.location.hostname.includes('realtywyze')
  const vertical = isRealEstate ? 'real_estate' : 'dealer'
  const [error, setError]     = useState<string | null>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/data-export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Export failed. Please try again.')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      const prefix = vertical === 'real_estate' ? 'realtywyze' : 'dealerwyze'
      a.download = `${prefix}-export-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-3 w-full p-4 rounded-lg border bg-card">
        <div className="h-5 w-5 bg-muted rounded flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded mt-2" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleExport}
        disabled={loading}
        className="flex items-center gap-3 w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left disabled:opacity-50"
      >
        <Download className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{loading ? 'Preparing export…' : 'Export All Data'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Download customers, vehicles, activities, and templates as a ZIP file (once per day)</p>
        </div>
      </button>
      {error && <p className="text-sm text-destructive mt-2 px-1">{error}</p>}
    </div>
  )
}
