'use client'

import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import CMAPricingCard from './CMAPricingCard'
import MarketInsightsSection from './MarketInsightsSection'
import {
  PROPERTY_TYPES,
  CONDITIONS,
  type PricingAnalysisFormData,
  type PricingAnalysisResponse,
} from './types'
import type { REMarketIntelligence } from '@/lib/pricing/reListingPricing'

interface PricingAnalysisModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId?: string
}

/**
 * Modal for RE listing pricing analysis.
 * Form collects property details, calls /api/listings/pricing-analysis,
 * displays 3-tier pricing recommendation and market insights.
 */
export default function PricingAnalysisModal({
  open,
  onOpenChange,
  propertyId,
}: PricingAnalysisModalProps) {
  const [formData, setFormData] = useState<PricingAnalysisFormData>({
    address: '',
    propertyType: 'single_family',
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    yearBuilt: null,
    condition: null,
  })

  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<REMarketIntelligence | null>(null)

  const handleInputChange = (
    field: keyof PricingAnalysisFormData,
    value: string | number | null
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: value === '' ? null : value,
    }))
  }

  const handleAnalyze = async () => {
    if (!formData.address.trim()) {
      setError('Please enter a property address')
      return
    }

    // Validate year if provided
    if (formData.yearBuilt !== null) {
      const currentYear = new Date().getFullYear()
      if (formData.yearBuilt < 1800 || formData.yearBuilt > currentYear) {
        setError(`Year must be between 1800 and ${currentYear}`)
        return
      }
      if (currentYear - formData.yearBuilt > 150) {
        setError('Property must have been built within the last 150 years')
        return
      }
    }

    setAnalyzing(true)
    setError(null)
    setAnalysis(null)

    try {
      const res = await fetch('/api/listings/pricing-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          property_id: propertyId,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error ?? 'Analysis failed')
      }

      const result = (await res.json()) as PricingAnalysisResponse

      if (!result.success || !result.analysis) {
        throw new Error(result.error ?? 'No analysis available')
      }

      setAnalysis(result.analysis)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      setError(msg)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleClose = () => {
    setFormData({
      address: '',
      propertyType: 'single_family',
      bedrooms: null,
      bathrooms: null,
      sqft: null,
      yearBuilt: null,
      condition: null,
    })
    setError(null)
    setAnalysis(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>RE Listing Pricing Analysis</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze market data and receive 3-tier pricing recommendations
          </p>
        </DialogHeader>

        {/* Result Display */}
        {analysis && (
          <div className="space-y-6 py-4">
            <CMAPricingCard analysis={analysis} />
            <MarketInsightsSection analysis={analysis} />

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setAnalysis(null)}
                className="flex-1"
              >
                Analyze Another
              </Button>
              <Button
                onClick={handleClose}
                className="flex-1"
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {/* Form Display */}
        {!analysis && (
          <div className="space-y-6 py-4">
            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Address */}
              <div>
                <Label htmlFor="address" className="text-sm font-medium mb-1.5 block">
                  Property Address *
                </Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={e => handleInputChange('address', e.target.value)}
                  placeholder="123 Main St, Anytown, CA 90210"
                  disabled={analyzing}
                />
              </div>

              {/* Property Type & Condition */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="propertyType" className="text-sm font-medium mb-1.5 block">
                    Property Type
                  </Label>
                  <Select
                    value={formData.propertyType}
                    onValueChange={v =>
                      handleInputChange('propertyType', v as typeof formData.propertyType)
                    }
                    disabled={analyzing}
                  >
                    <SelectTrigger id="propertyType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROPERTY_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="condition" className="text-sm font-medium mb-1.5 block">
                    Condition
                  </Label>
                  <Select
                    value={formData.condition || ''}
                    onValueChange={v =>
                      handleInputChange('condition', v === '' ? null : (v as typeof formData.condition))
                    }
                    disabled={analyzing}
                  >
                    <SelectTrigger id="condition">
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Not specified</SelectItem>
                      {CONDITIONS.map(cond => (
                        <SelectItem key={cond.value} value={cond.value}>
                          {cond.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Beds / Baths / Sqft */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="bedrooms" className="text-sm font-medium mb-1.5 block">
                    Bedrooms
                  </Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    value={formData.bedrooms ?? ''}
                    onChange={e =>
                      handleInputChange('bedrooms', e.target.value === '' ? null : parseInt(e.target.value))
                    }
                    placeholder="0"
                    disabled={analyzing}
                  />
                </div>

                <div>
                  <Label htmlFor="bathrooms" className="text-sm font-medium mb-1.5 block">
                    Bathrooms
                  </Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    value={formData.bathrooms ?? ''}
                    onChange={e =>
                      handleInputChange('bathrooms', e.target.value === '' ? null : parseFloat(e.target.value))
                    }
                    placeholder="0"
                    step="0.5"
                    disabled={analyzing}
                  />
                </div>

                <div>
                  <Label htmlFor="sqft" className="text-sm font-medium mb-1.5 block">
                    Sqft
                  </Label>
                  <Input
                    id="sqft"
                    type="number"
                    value={formData.sqft ?? ''}
                    onChange={e =>
                      handleInputChange('sqft', e.target.value === '' ? null : parseInt(e.target.value))
                    }
                    placeholder="0"
                    disabled={analyzing}
                  />
                </div>
              </div>

              {/* Year Built */}
              <div>
                <Label htmlFor="yearBuilt" className="text-sm font-medium mb-1.5 block">
                  Year Built
                </Label>
                <Input
                  id="yearBuilt"
                  type="number"
                  value={formData.yearBuilt ?? ''}
                  onChange={e =>
                    handleInputChange('yearBuilt', e.target.value === '' ? null : parseInt(e.target.value))
                  }
                  placeholder="2020"
                  disabled={analyzing}
                  min="1800"
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={analyzing}
              >
                Cancel
              </Button>
              <Button onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze Price'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
