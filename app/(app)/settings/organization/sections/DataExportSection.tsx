'use client'

import { useState } from 'react'
import { Download, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DataExportSection({ isRE = false }: { isRE?: boolean }) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleExport = async () => {
    try {
      setIsLoading(true)
      setError(null)
      setSuccess(false)

      const response = await fetch('/api/settings/data-export')

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `Failed to export data (${response.status})`)
      }

      // Download the ZIP file
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${isRE ? 'realtywyze' : 'dealerwyze'}-data-export-${new Date().toISOString().slice(0, 10)}.zip`
      link.click()
      URL.revokeObjectURL(url)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-4 border-t pt-4 mt-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Data & Privacy</p>

      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 px-4 py-3 mb-3">
        <h3 className="text-sm font-medium text-blue-900 dark:text-blue-400 mb-1">Download Your Data</h3>
        <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
          {isRE
            ? 'Export all your agency data including clients, properties, transactions, and communications.'
            : 'Export all your dealership data including customers, vehicles, activities, and communications.'}
        </p>
        <div className="flex items-start gap-2">
          <Button
            onClick={handleExport}
            disabled={isLoading}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isLoading ? 'Generating...' : 'Export Data (ZIP)'}
          </Button>
        </div>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
          Includes customers, {isRE ? 'properties' : 'vehicles'}, tasks, templates, communications history, and more.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 px-4 py-3 text-sm text-green-700 dark:text-green-400 mb-3">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Your data export has been downloaded successfully.</span>
        </div>
      )}

      <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
        <p>
          <strong>What's included:</strong> Customers/contacts, {isRE ? 'properties' : 'vehicles'}, tasks, templates,
          message sequences, support history, voice calls, payments, and organization settings.
        </p>
        <p>
          <strong>Format:</strong> ZIP file containing CSV files for easy import into other tools.
        </p>
        <p>
          <strong>Security:</strong> Keep this file secure—it contains sensitive business data. Each export is
          logged for security and compliance purposes.
        </p>
        <p>
          <strong>Right to Deletion:</strong> To request permanent deletion of your data, please{' '}
          <a href="mailto:support@dealerwyze.com" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
            contact support
          </a>
          .
        </p>
      </div>
    </div>
  )
}
