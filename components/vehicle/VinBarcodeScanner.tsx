'use client'

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onDetected: (vin: string) => void
  onClose: () => void
}

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i

export default function VinBarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const detectedRef = useRef(false)
  const [status, setStatus] = useState<'scanning' | 'found' | 'error'>('scanning')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
        if (detectedRef.current) return

        if (result) {
          const text = result.getText().replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase()
          if (VIN_REGEX.test(text)) {
            detectedRef.current = true
            setStatus('found')
            setTimeout(() => {
              onDetected(text)
            }, 300)
          }
          // Non-VIN barcode — keep scanning silently
        }

        if (err && (err as Error).name !== 'NotFoundException') {
          setStatus('error')
          setErrorMsg('Camera access denied. Please allow camera access and try again.')
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMsg('Could not start camera. Make sure camera access is allowed.')
      })

    return () => {
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null
        stream?.getTracks().forEach(t => t.stop())
        if (videoRef.current) videoRef.current.srcObject = null
      } catch { /* ignore */ }
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <p className="text-sm font-medium">Point camera at the VIN barcode</p>
        <button onClick={onClose} className="p-1" aria-label="Close scanner">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Camera feed */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scan window overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            {/* Scan box */}
            <div
              className={`relative w-72 h-24 border-2 rounded transition-colors duration-200 ${
                status === 'found'
                  ? 'border-green-400 bg-green-400/10'
                  : 'border-white/80'
              }`}
            >
              {/* Corner accents */}
              <div className={`absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 ${status === 'found' ? 'border-green-400' : 'border-white'}`} />
              <div className={`absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 ${status === 'found' ? 'border-green-400' : 'border-white'}`} />
              <div className={`absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 ${status === 'found' ? 'border-green-400' : 'border-white'}`} />
              <div className={`absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 ${status === 'found' ? 'border-green-400' : 'border-white'}`} />

              {/* Animated scan line */}
              {status === 'scanning' && (
                <div className="animate-scan-line absolute inset-x-0 h-0.5 bg-red-500/80" />
              )}

              {status === 'found' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-green-400 text-sm font-bold">VIN Found!</p>
                </div>
              )}
            </div>

            <p className="text-white/70 text-xs text-center mt-3">
              Driver&apos;s door jamb or dashboard barcode
            </p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {status === 'error' && (
        <div className="p-4 bg-red-900/80 text-white text-sm text-center">
          <p>{errorMsg}</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-white mt-2"
            onClick={onClose}
          >
            Go back
          </Button>
        </div>
      )}

      {/* Scanning hint */}
      {status === 'scanning' && (
        <div className="p-4 text-center">
          <p className="text-white/50 text-xs">
            The barcode is usually on a sticker on the driver&apos;s door jamb
          </p>
        </div>
      )}
    </div>
  )
}
