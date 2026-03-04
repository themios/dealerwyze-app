'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

export default function ExportDataButton() {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch('/api/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dealerwyze-export-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-3 w-full p-4 rounded-lg border bg-card hover:bg-accent transition-colors text-left disabled:opacity-50"
    >
      <Download className="h-5 w-5 text-primary flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{loading ? 'Preparing export…' : 'Export All Data'}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Download customers, vehicles, activities, BHPH, ledger, tasks, contacts as Excel</p>
      </div>
    </button>
  )
}
