'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ConfidenceBadge from './ConfidenceBadge'
import type { ProspectExtractionResult } from './types'

interface ExtractionResultModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: ProspectExtractionResult | null
  loading: boolean
  onImport: () => Promise<void>
  onMerge: () => Promise<void>
}

/**
 * Modal displaying extracted prospect fields with confidence badges.
 * Allows user to review and decide to import as new lead or merge with existing.
 */
export default function ExtractionResultModal({
  open,
  onOpenChange,
  result,
  loading,
  onImport,
  onMerge,
}: ExtractionResultModalProps) {
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = async () => {
    setIsImporting(true)
    try {
      await onImport()
      onOpenChange(false)
    } finally {
      setIsImporting(false)
    }
  }

  const handleMerge = async () => {
    setIsImporting(true)
    try {
      await onMerge()
      onOpenChange(false)
    } finally {
      setIsImporting(false)
    }
  }

  if (!result) return null

  // Group fields for display — filter out null/undefined fields
  const contactFields = [
    { label: 'First Name', value: result.first_name },
    { label: 'Last Name', value: result.last_name },
    { label: 'Email', value: result.email },
    { label: 'Phone', value: result.phone },
    { label: 'Phone (Alt)', value: result.phone2 },
  ].filter(f => f.value)

  const locationFields = [
    { label: 'City', value: result.city },
    { label: 'State', value: result.state },
    { label: 'Zip', value: result.zip },
  ].filter(f => f.value)

  const propertyFields = [
    { label: 'Property Type', value: result.property_type },
    { label: 'Property Address', value: result.property_address },
    { label: 'Property City', value: result.property_city },
    { label: 'Budget', value: result.budget },
  ].filter(f => f.value)

  const prospectFields = [
    { label: 'Intent', value: result.prospect_intent },
    { label: 'Urgency', value: result.urgency },
    { label: 'Lead Source', value: result.lead_source },
    { label: 'Notes', value: result.notes },
  ].filter(f => f.value)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Extracted Prospect</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Overall Confidence: <ConfidenceBadge confidence={result.overall_confidence} />
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {contactFields.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contactFields.map(({ label, value }) => (
                    <div key={label} className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {value.value ? String(value.value) : '—'}
                        </p>
                        {value.value && (
                          <ConfidenceBadge confidence={value.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {locationFields.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Prospect Location</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {locationFields.map(({ label, value }) => (
                    <div key={label} className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {value.value ? String(value.value) : '—'}
                        </p>
                        {value.value && (
                          <ConfidenceBadge confidence={value.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {propertyFields.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Property Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {propertyFields.map(({ label, value }) => (
                    <div key={label} className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {value.value ? String(value.value) : '—'}
                        </p>
                        {value.value && (
                          <ConfidenceBadge confidence={value.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {prospectFields.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Prospect Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {prospectFields.map(({ label, value }) => (
                    <div key={label} className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {value.value ? String(value.value) : '—'}
                        </p>
                        {value.value && (
                          <ConfidenceBadge confidence={value.confidence} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleMerge}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Merge with Existing'
            )}
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              'Import as New Lead'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
