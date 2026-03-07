'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, Download } from 'lucide-react'

interface ImportSummary {
  total_rows: number
  processed: number
  created: number
  duplicate: number
  skipped: number
  errors: number
  over_limit: number
}

export default function ImportLeadsDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  async function handleDownloadTemplate() {
    const res = await fetch('/api/leads/import/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (!file) {
      setError('Choose a file first')
      return
    }
    setError(null)
    setSummary(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Import failed')
      } else {
        setSummary(data.summary)
        setFile(null)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setFile(null)
      setError(null)
      setSummary(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Import leads from spreadsheet">
          <FileSpreadsheet className="h-5 w-5" />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md flex flex-col max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import Leads</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-h-0">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or Excel file with columns for Name and Phone or Email. Use our template for the correct format, or use your own — we recognize many column names (e.g. Customer Name, Phone Number, Email Address).
          </p>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-center gap-2"
              onClick={handleDownloadTemplate}
            >
              <Download className="h-4 w-4" />
              Download template (CSV)
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Your file (CSV or XLSX, max 2 MB, 500 rows)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-primary file:text-primary-foreground file:text-sm"
              onChange={e => {
                const f = e.target.files?.[0]
                setFile(f ?? null)
                setError(null)
                setSummary(null)
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {summary && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium">Import complete</p>
              <p>{summary.created} created</p>
              {summary.duplicate > 0 && <p>{summary.duplicate} duplicates skipped</p>}
              {summary.skipped > 0 && <p>{summary.skipped} skipped (no name or contact)</p>}
              {summary.errors > 0 && <p>{summary.errors} errors</p>}
              {summary.over_limit > 0 && (
                <p className="text-muted-foreground">Only first 500 rows processed. {summary.over_limit} rows not imported.</p>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleImport}
            disabled={loading || !file}
          >
            {loading ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
