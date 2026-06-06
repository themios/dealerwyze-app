'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, Camera, Clipboard, PencilIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type InputMode = 'select' | 'scan' | 'paste' | 'manual'

interface ListingForm {
  address: string
  price: string
  bedrooms: string
  bathrooms: string
  sqft: string
  property_type: string
  year_built: string
  lot_size: string
  mls_number: string
  description: string
}

export default function ListingIntakeButton() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<InputMode>('select')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [form, setForm] = useState<ListingForm>({
    address: '',
    price: '',
    bedrooms: '',
    bathrooms: '',
    sqft: '',
    property_type: '',
    year_built: '',
    lot_size: '',
    mls_number: '',
    description: '',
  })
  const [scanMessage, setScanMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function extractListingFromImage(base64: string) {
    try {
      setScanning(true)
      setScanMessage(null)
      const res = await fetch('/api/vehicles/intake/scan-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScanMessage({ type: 'error', text: data.error || 'Failed to extract listing info' })
        return
      }
      setForm(prev => ({
        ...prev,
        address: data.address || prev.address,
        price: data.price ? String(data.price) : prev.price,
        bedrooms: data.bedrooms ? String(data.bedrooms) : prev.bedrooms,
        bathrooms: data.bathrooms ? String(data.bathrooms) : prev.bathrooms,
        sqft: data.sqft ? String(data.sqft) : prev.sqft,
        property_type: data.property_type || prev.property_type,
        year_built: data.year_built ? String(data.year_built) : prev.year_built,
        lot_size: data.lot_size || prev.lot_size,
        mls_number: data.mls_number || prev.mls_number,
        description: data.description || data.features || prev.description,
      }))
      setScanMessage({ type: 'success', text: 'Extracted listing info from image' })
      setMode('manual')
    } catch (err) {
      setScanMessage({ type: 'error', text: 'Failed to scan image' })
    } finally {
      setScanning(false)
    }
  }

  async function handleScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setScanMessage({ type: 'error', text: 'Select an image file (JPG, PNG, PDF screenshot, etc.)' })
      return
    }
    const reader = new FileReader()
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1]
      if (base64) await extractListingFromImage(base64)
    }
    reader.readAsDataURL(file)
  }

  async function extractFromPastedText(text: string) {
    try {
      setScanning(true)
      setScanMessage(null)
      const res = await fetch('/api/vehicles/intake/parse-listing-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setScanMessage({ type: 'error', text: data.error || 'Could not extract listing info' })
        return
      }
      setForm(prev => ({
        ...prev,
        address: data.address || prev.address,
        price: data.price ? String(data.price) : prev.price,
        bedrooms: data.bedrooms ? String(data.bedrooms) : prev.bedrooms,
        bathrooms: data.bathrooms ? String(data.bathrooms) : prev.bathrooms,
        sqft: data.sqft ? String(data.sqft) : prev.sqft,
        property_type: data.property_type || prev.property_type,
        year_built: data.year_built ? String(data.year_built) : prev.year_built,
        lot_size: data.lot_size || prev.lot_size,
        mls_number: data.mls_number || prev.mls_number,
        description: data.description || data.features || prev.description,
      }))
      setScanMessage({ type: 'success', text: 'Extracted listing info from text' })
      setMode('manual')
    } catch (err) {
      setScanMessage({ type: 'error', text: 'Failed to parse listing text' })
    } finally {
      setScanning(false)
    }
  }

  async function saveListing() {
    if (!form.address.trim()) {
      setScanMessage({ type: 'error', text: 'Address is required' })
      return
    }
    setLoading(true)
    try {
      const price = form.price ? parseInt(form.price.replace(/\D/g, ''), 10) : null
      const bedrooms = form.bedrooms ? parseInt(form.bedrooms, 10) : null
      const bathrooms = form.bathrooms ? parseFloat(form.bathrooms) : null
      const sqft = form.sqft ? parseInt(form.sqft.replace(/\D/g, ''), 10) : null

      const notes = [
        form.property_type && `Type: ${form.property_type}`,
        form.year_built && `Year Built: ${form.year_built}`,
        form.lot_size && `Lot Size: ${form.lot_size}`,
        form.mls_number && `MLS: ${form.mls_number}`,
        form.description && `Details: ${form.description}`,
      ]
        .filter(Boolean)
        .join('\n')

      const { error } = await supabase.from('vehicles').insert({
        year: 0,
        make: 'RE',
        model: form.address.slice(0, 100),
        address_line1: form.address,
        price,
        bedrooms,
        bathrooms,
        sqft,
        status: 'available',
        stock_no: `MAN-${Date.now().toString().slice(-6)}`,
        notes: notes || null,
      })

      if (error) {
        setScanMessage({ type: 'error', text: error.message })
        return
      }

      setOpen(false)
      router.refresh()
    } catch (err) {
      setScanMessage({ type: 'error', text: 'Failed to save listing' })
    } finally {
      setLoading(false)
    }
  }

  const renderDialogContent = () => {
    if (mode === 'select') {
      return (
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 border rounded-lg hover:bg-muted text-left transition"
          >
            <div className="flex items-start gap-3">
              <Camera className="h-5 w-5 mt-0.5 text-blue-600" />
              <div>
                <p className="font-medium">Scan Photo or Document</p>
                <p className="text-sm text-muted-foreground">Listing sheet, MLS printout, or property photo</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('paste')}
            className="p-4 border rounded-lg hover:bg-muted text-left transition"
          >
            <div className="flex items-start gap-3">
              <Clipboard className="h-5 w-5 mt-0.5 text-green-600" />
              <div>
                <p className="font-medium">Paste Listing Page</p>
                <p className="text-sm text-muted-foreground">MLS, Zillow, your website, or marketplace text</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('manual')}
            className="p-4 border rounded-lg hover:bg-muted text-left transition"
          >
            <div className="flex items-start gap-3">
              <PencilIcon className="h-5 w-5 mt-0.5 text-orange-600" />
              <div>
                <p className="font-medium">Enter Manually</p>
                <p className="text-sm text-muted-foreground">Type in the listing details</p>
              </div>
            </div>
          </button>
        </div>
      )
    }

    if (mode === 'paste') {
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="paste-text">Paste listing information:</Label>
            <Textarea
              id="paste-text"
              placeholder="Paste MLS listing, Zillow page text, or property details here..."
              className="mt-2 min-h-20"
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                const textArea = document.getElementById('paste-text') as HTMLTextAreaElement
                if (textArea?.value) {
                  extractFromPastedText(textArea.value)
                }
              }}
              disabled={scanning}
            >
              {scanning ? 'Extracting...' : 'Extract from Text'}
            </Button>
          </div>
          {scanMessage && (
            <div className={`p-3 rounded-md text-sm ${scanMessage.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
              {scanMessage.text}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setMode('select')}>
            Back
          </Button>
        </div>
      )
    }

    if (mode === 'manual') {
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="address">Address *</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="123 Main St, City, CA 12345"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                value={form.price}
                onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))}
                placeholder="$500,000"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="beds">Bedrooms</Label>
              <Input
                id="beds"
                value={form.bedrooms}
                onChange={(e) => setForm(prev => ({ ...prev, bedrooms: e.target.value }))}
                placeholder="3"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="baths">Bathrooms</Label>
              <Input
                id="baths"
                value={form.bathrooms}
                onChange={(e) => setForm(prev => ({ ...prev, bathrooms: e.target.value }))}
                placeholder="2.5"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="sqft">Sq Ft</Label>
              <Input
                id="sqft"
                value={form.sqft}
                onChange={(e) => setForm(prev => ({ ...prev, sqft: e.target.value }))}
                placeholder="2,500"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">Property Type</Label>
              <Input
                id="type"
                value={form.property_type}
                onChange={(e) => setForm(prev => ({ ...prev, property_type: e.target.value }))}
                placeholder="Single Family"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="year">Year Built</Label>
              <Input
                id="year"
                value={form.year_built}
                onChange={(e) => setForm(prev => ({ ...prev, year_built: e.target.value }))}
                placeholder="2020"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="mls">MLS #</Label>
            <Input
              id="mls"
              value={form.mls_number}
              onChange={(e) => setForm(prev => ({ ...prev, mls_number: e.target.value }))}
              placeholder="12345678"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="description">Description / Features</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Key features, amenities, condition notes..."
              className="mt-1 min-h-20"
            />
          </div>

          {scanMessage && (
            <div className={`p-3 rounded-md text-sm ${scanMessage.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-600'}`}>
              {scanMessage.text}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={saveListing} disabled={loading || !form.address.trim()}>
              {loading ? 'Saving...' : 'Add Listing'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('select')}>
              Back
            </Button>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
          setMode('select')
          setScanMessage(null)
        }}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Listing
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Property Listing</DialogTitle>
            <DialogDescription>Choose how you would like to add this listing</DialogDescription>
          </DialogHeader>
          {renderDialogContent()}
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleScanFile}
        className="hidden"
      />
    </>
  )
}
