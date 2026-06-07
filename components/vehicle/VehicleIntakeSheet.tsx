'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ClipboardPaste, PenLine, Loader2, ScanLine } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import dynamic from 'next/dynamic'
import DuplicateMatchCard from './DuplicateMatchCard'

// Lazy-load the heavy barcode scanner — uses browser APIs, no SSR
const VinBarcodeScanner = dynamic(() => import('./VinBarcodeScanner'), { ssr: false })

type IntakeMethod = 'barcode' | 'photo' | 'monroney' | 'paste'

interface ExtractedData {
  vin?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  mileage?: number | null
  color?: string | null
  purchase_price?: number | null
  purchased_from?: string | null
  purchased_at?: string | null
  acquisition_source?: 'auction' | 'private' | 'trade_in' | 'dealer_trade' | 'other' | null
  auction_name?: string | null
  auction_lot?: string | null
  status?: 'staging' | 'available' | null
  acquisition_notes?: string | null
  imageBase64?: string | null
  mimeType?: string | null
}

interface MatchedVehicle {
  id: string
  stock_no: string
  year: number
  make: string
  model: string
  trim: string | null
  status: string
  match_type: 'vin' | 'ymm'
}

type Step = 'menu' | 'barcode' | 'photo-processing' | 'paste' | 'result'

interface Props {
  open: boolean
  onClose: () => void
}

export default function VehicleIntakeSheet({ open, onClose }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('menu')
  const [intakeMethod, setIntakeMethod] = useState<IntakeMethod | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processingMsg, setProcessingMsg] = useState('')
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [match, setMatch] = useState<MatchedVehicle | null>(null)
  const [pastedText, setPastedText] = useState('')

  function reset() {
    setStep('menu')
    setProcessing(false)
    setExtracted(null)
    setMatch(null)
    setPastedText('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function navigateToForm(data: ExtractedData) {
    const params = new URLSearchParams()
    if (data.vin) params.set('vin', data.vin)
    if (data.year) params.set('year', String(data.year))
    if (data.make) params.set('make', data.make)
    if (data.model) params.set('model', data.model)
    if (data.trim) params.set('trim', data.trim)
    if (data.mileage) params.set('mileage', String(data.mileage))
    if (data.color) params.set('color', data.color)
    if (data.purchase_price != null) params.set('purchase_price', String(data.purchase_price))
    if (data.purchased_from) params.set('purchased_from', data.purchased_from)
    if (data.purchased_at) params.set('purchased_at', data.purchased_at)
    if (data.acquisition_source) params.set('acquisition_source', data.acquisition_source)
    if (data.auction_name) params.set('auction_name', data.auction_name)
    if (data.auction_lot) params.set('auction_lot', data.auction_lot)
    if (data.status) params.set('status', data.status)
    if (data.acquisition_notes) params.set('acquisition_notes', data.acquisition_notes)

    // Store image in sessionStorage — too large for URL params
    if (data.imageBase64 && data.mimeType) {
      try {
        sessionStorage.setItem(
          'intake_image',
          JSON.stringify({ imageBase64: data.imageBase64, mimeType: data.mimeType })
        )
      } catch {
        // storage quota exceeded — skip silently
      }
    }

    router.push(`/vehicles/new?${params.toString()}`)
  }

  // After extraction: check for duplicate, then show result or navigate
  const processExtracted = useCallback(async (data: ExtractedData) => {
    setExtracted(data)
    setProcessingMsg('Checking your inventory...')

    const params = new URLSearchParams()
    if (data.vin) params.set('vin', data.vin)
    if (data.year) params.set('year', String(data.year))
    if (data.make) params.set('make', data.make ?? '')
    if (data.model) params.set('model', data.model ?? '')

    try {
      const dupRes = await fetch(`/api/vehicles/intake/check-duplicate?${params}`)
      const { matches } = await dupRes.json()

      setProcessing(false)

      if (matches?.length > 0) {
        setMatch(matches[0])
        setStep('result')
      } else {
        navigateToForm(data)
        handleClose()
      }
    } catch {
      setProcessing(false)
      navigateToForm(data)
      handleClose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // VIN barcode callback
  const handleVinDetected = useCallback(async (vin: string) => {
    setStep('photo-processing')
    setProcessing(true)
    setProcessingMsg('Looking up VIN...')

    try {
      const res = await fetch('/api/vehicles/intake/vin-decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin }),
      })
      const data = await res.json()

      if (res.ok) {
        await processExtracted({ vin, year: data.year, make: data.make, model: data.model, trim: data.trim })
      } else {
        // VIN not in NHTSA — proceed with just the VIN
        await processExtracted({ vin })
      }
    } catch {
      await processExtracted({ vin })
    }
  }, [processExtracted])

  // Photo/file selected
  async function handleImageSelected(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5MB')
      return
    }

    setStep('photo-processing')
    setProcessing(true)
    setProcessingMsg('Reading image...')

    try {
      // Read as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mimeType = file.type

      // Route based on intake method
      if (intakeMethod === 'monroney') {
        await handleMonroneyExtraction(base64, mimeType)
      } else {
        await handleGenericImageScan(base64, mimeType)
      }
    } catch {
      setProcessing(false)
      setStep('menu')
      alert('Something went wrong reading that image. Please try again.')
    }
  }

  // Extract vehicle data from Monroney (window sticker) photo
  async function handleMonroneyExtraction(imageBase64: string, mimeType: string) {
    setProcessingMsg('Extracting from Monroney sticker...')

    try {
      const res = await fetch('/api/vehicles/intake/monroney-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, imageMimeType: mimeType }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setProcessing(false)
        alert(`Could not read Monroney: ${data.error || 'Unknown error'}. Try again with a clearer photo.`)
        setStep('menu')
        setIntakeMethod(null)
        return
      }

      if (data.vehicle) {
        const extracted: ExtractedData = {
          vin: data.vehicle.vin,
          year: data.vehicle.year,
          make: data.vehicle.make,
          model: data.vehicle.model,
          mileage: data.vehicle.mileage,
          color: data.vehicle.color,
          purchase_price: data.vehicle.price,
          acquisition_source: 'dealer_trade', // Monroney = often used vehicle trade-in
        }
        await processExtracted(extracted)
      }
    } catch (err) {
      setProcessing(false)
      setStep('menu')
      setIntakeMethod(null)
      alert(`Extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Generic image scan (barcode, auction sheet, etc.)
  async function handleGenericImageScan(imageBase64: string, mimeType: string) {
    setProcessingMsg('Extracting vehicle info...')

    try {
      const scanRes = await fetch('/api/vehicles/intake/scan-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
      })
      const scanData = await scanRes.json()

      if (!scanRes.ok || (!scanData.vin && !scanData.year && !scanData.make)) {
        setProcessing(false)
        alert('Could not read vehicle info from that image. Try a clearer photo or enter manually.')
        setStep('menu')
        setIntakeMethod(null)
        return
      }

      let finalData: ExtractedData = { ...scanData, imageBase64, mimeType }

      // If VIN found but make/model missing, enrich via NHTSA
      if (scanData.vin && scanData.vin.length === 17 && (!scanData.make || !scanData.model)) {
        setProcessingMsg('Looking up VIN...')
        try {
          const vinRes = await fetch('/api/vehicles/intake/vin-decode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vin: scanData.vin }),
          })
          if (vinRes.ok) {
            const vinData = await vinRes.json()
            finalData = {
              ...finalData,
              year: finalData.year ?? vinData.year,
              make: finalData.make ?? vinData.make,
              model: finalData.model ?? vinData.model,
              trim: finalData.trim ?? vinData.trim,
            }
          }
        } catch {
          // best-effort — proceed without NHTSA data
        }
      }

      await processExtracted(finalData)
    } catch {
      setProcessing(false)
      setStep('menu')
      setIntakeMethod(null)
      alert('Something went wrong reading that image. Please try again.')
    }
  }

  async function handlePasteSubmit() {
    const text = pastedText.trim()
    if (text.length < 40) {
      alert('Paste more of the auction or website page so AI has enough context.')
      return
    }

    setStep('photo-processing')
    setProcessing(true)
    setProcessingMsg('Reading pasted page...')

    try {
      const res = await fetch('/api/vehicles/intake/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()

      if (!res.ok) {
        setProcessing(false)
        setStep('paste')
        alert(data.error ?? 'Could not read vehicle info from that pasted content.')
        return
      }

      let finalData: ExtractedData = data

      if (data.vin && data.vin.length === 17 && (!data.make || !data.model)) {
        setProcessingMsg('Looking up VIN...')
        try {
          const vinRes = await fetch('/api/vehicles/intake/vin-decode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vin: data.vin }),
          })
          if (vinRes.ok) {
            const vinData = await vinRes.json()
            finalData = {
              ...finalData,
              year: finalData.year ?? vinData.year,
              make: finalData.make ?? vinData.make,
              model: finalData.model ?? vinData.model,
              trim: finalData.trim ?? vinData.trim,
            }
          }
        } catch {
          // best-effort enrichment only
        }
      }

      if (data.notes) {
        finalData = {
          ...finalData,
          acquisition_notes: data.notes,
        }
      }

      await processExtracted(finalData)
    } catch {
      setProcessing(false)
      setStep('paste')
      alert('Something went wrong parsing that pasted content. Please try again.')
    }
  }

  return (
    <>
      {/* Barcode scanner renders full-screen outside the sheet */}
      {step === 'barcode' && (
        <VinBarcodeScanner
          onDetected={handleVinDetected}
          onClose={() => setStep('menu')}
        />
      )}

      <Sheet open={open && step !== 'barcode'} onOpenChange={v => !v && handleClose()}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-10">
          <SheetHeader className="mb-5">
            <SheetTitle>Add Vehicle</SheetTitle>
          </SheetHeader>

          {/* Processing spinner */}
          {step === 'photo-processing' && processing && (
            <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">{processingMsg}</p>
            </div>
          )}

          {/* Duplicate found */}
          {step === 'result' && match && extracted && (
            <div className="-mx-4">
              <DuplicateMatchCard
                match={match}
                extracted={extracted}
                onDismiss={() => { setMatch(null); setStep('menu') }}
                onAddNew={() => { navigateToForm(extracted); handleClose() }}
              />
            </div>
          )}

          {/* Main menu */}
          {step === 'menu' && (
            <div className="space-y-3">
              {/* Scan VIN Barcode */}
              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
                onClick={() => setStep('barcode')}
              >
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <ScanLine className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Scan VIN Barcode</p>
                  <p className="text-xs text-muted-foreground">Point camera at the door jamb sticker</p>
                </div>
              </button>

              {/* Scan Monroney Photo */}
              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
                onClick={() => {
                  setIntakeMethod('monroney')
                  photoInputRef.current?.click()
                }}
              >
                <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <Camera className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Scan Monroney</p>
                  <p className="text-xs text-muted-foreground">Window sticker with vehicle details</p>
                </div>
              </button>

              {/* Scan Photo */}
              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
                onClick={() => {
                  setIntakeMethod('photo')
                  fileInputRef.current?.click()
                }}
              >
                <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                  <Camera className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Scan Photo or Document</p>
                  <p className="text-xs text-muted-foreground">Auction sheet, buyer&apos;s guide, or screenshot</p>
                </div>
              </button>

              {/* Paste Website Content */}
              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
                onClick={() => setStep('paste')}
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <ClipboardPaste className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Paste Website or Auction Page</p>
                  <p className="text-xs text-muted-foreground">Paste ACV, auction, marketplace, or inventory page text</p>
                </div>
              </button>

              {/* Enter Manually */}
              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
                onClick={() => { handleClose(); router.push('/vehicles/new') }}
              >
                <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <PenLine className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Enter Manually</p>
                  <p className="text-xs text-muted-foreground">Type in the vehicle details</p>
                </div>
              </button>
            </div>
          )}

          {step === 'paste' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Paste the page content</p>
                <p className="text-xs text-muted-foreground">
                  AI will try to pull out the VIN, year, make, model, mileage, purchase price, purchase date, source, and useful notes.
                </p>
              </div>
              <Textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste the auction or website page text here..."
                rows={12}
                className="resize-none text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('menu')}>
                  Back
                </Button>
                <Button type="button" className="flex-1" onClick={handlePasteSubmit}>
                  Parse with AI
                </Button>
              </div>
            </div>
          )}

          {/* Hidden file input — no capture attr so OS shows camera + gallery picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImageSelected(file)
              e.target.value = ''
            }}
          />

          {/* Hidden photo input for Monroney — with camera capture on mobile */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImageSelected(file)
              e.target.value = ''
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
