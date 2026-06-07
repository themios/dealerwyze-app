'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface VehicleImportResult {
  success: boolean
  message: string
  result: {
    success: number
    failed: number
    errors: Array<{ id: string; error: string }>
  }
  parseErrors?: string[]
}

export function VehicleImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VehicleImportResult | null>(null)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/vehicles/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Import failed')
        setLoading(false)
        setOpen(false)
        return
      }

      setResult(data)
      setLoading(false)

      // Close on success
      if (data.success) {
        toast.success(`${data.result.success} vehicles imported`)
        setTimeout(() => {
          setOpen(false)
          setResult(null)
        }, 2000)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setLoading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      <Button
        onClick={() => {
          setOpen(true)
          setResult(null)
        }}
        variant="outline"
        size="sm"
      >
        <Upload className="mr-2 h-4 w-4" />
        Import CSV
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Vehicles from CSV</DialogTitle>
            <DialogDescription>
              Upload a CSV file with columns: VIN, Year, Make, Model, Price, Mileage, Color, Condition, Auction, Lot
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <div className="space-y-4">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Select CSV File
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Max 10MB. CSV must have header row.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="font-medium">{result.message}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {result.result.success} imported, {result.result.failed} failed
                  </p>
                </div>
              </div>

              {result.result.errors.length > 0 && (
                <div className="bg-muted p-3 rounded text-sm max-h-40 overflow-y-auto">
                  <p className="font-medium mb-2">Failed rows:</p>
                  {result.result.errors.map((e) => (
                    <p key={e.id} className="text-xs text-muted-foreground">
                      {e.id}: {e.error}
                    </p>
                  ))}
                </div>
              )}

              {result.parseErrors && result.parseErrors.length > 0 && (
                <div className="bg-muted p-3 rounded text-sm max-h-40 overflow-y-auto">
                  <p className="font-medium mb-2">Parse errors:</p>
                  {result.parseErrors.map((e, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {e}
                    </p>
                  ))}
                </div>
              )}

              <Button
                onClick={() => {
                  setResult(null)
                  setOpen(false)
                }}
                className="w-full"
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
