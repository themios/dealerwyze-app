'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'

export default function QuickAddVehicleButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleImageSelected(file: File) {
    // Read file as base64
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        // For now, just show a toast
        // Wave 3 will implement the extraction via /api/vehicles/intake/bulk-extract with image param
        toast.info('Photo capture support coming soon')

        // Placeholder for future image extraction:
        // const res = await fetch('/api/vehicles/intake/bulk-extract', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ image: base64 })
        // })
      } catch {
        toast.error('Failed to process image')
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
