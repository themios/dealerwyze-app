'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  onListingAdded?: (listing: unknown) => void
}

export default function QuickAddListingButton({ onListingAdded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageSelected(file: File) {
    // Read file as base64
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target?.result as string

      try {
        const res = await fetch('/api/vehicles/intake/bulk-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 })
        })

        const data = await res.json() as { listings: unknown[] }

        if (data.listings.length === 0) {
          toast.error('Could not extract listing from image')
          return
        }

        const listingData = data.listings[0] as Record<string, unknown>
        const listing = {
          address: String(listingData.address || ''),
          price: typeof listingData.price === 'number' ? listingData.price : undefined,
          beds: typeof listingData.beds === 'number' ? listingData.beds : undefined,
          baths: typeof listingData.baths === 'number' ? listingData.baths : undefined,
          sqft: typeof listingData.sqft === 'number' ? listingData.sqft : undefined,
          property_type: typeof listingData.property_type === 'string' ? listingData.property_type : undefined,
          year_built: typeof listingData.year_built === 'number' ? listingData.year_built : undefined,
          lot_size: typeof listingData.lot_size === 'string' ? listingData.lot_size : undefined,
          mls_number: typeof listingData.mls_number === 'string' ? listingData.mls_number : undefined,
          description: typeof listingData.description === 'string' ? listingData.description : undefined
        }
        onListingAdded?.(listing)
        toast.success(`Added: ${listing.address}`)
      } catch {
        toast.error('Failed to extract from image')
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        className="gap-1"
      >
        <Camera className="h-4 w-4" />
        Quick Add
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          if (file) handleImageSelected(file)
        }}
        className="hidden"
      />
    </>
  )
}
