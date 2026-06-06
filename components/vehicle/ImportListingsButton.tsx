'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle, AlertCircle } from 'lucide-react'

type Status = 'idle' | 'loading' | 'done' | 'error'
type ImportResponse = {
  imported?: number
  error?: string
}

export default function ImportListingsButton() {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('loading')
    setResult(null)

    try {
      const text = await file.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) throw new Error('CSV must have header row + at least 1 listing')

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const addressIdx = headers.indexOf('address')
      const priceIdx = headers.indexOf('price')
      const bedroomsIdx = headers.indexOf('bedrooms')
      const bathroomsIdx = headers.indexOf('bathrooms')
      const sqftIdx = headers.indexOf('sqft')
      const descriptionIdx = headers.indexOf('description')

      if (addressIdx === -1) throw new Error('CSV must have "address" column')

      const listings = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map(c => c.trim())
        return {
          address: cols[addressIdx],
          price: priceIdx >= 0 ? parseFloat(cols[priceIdx]) || null : null,
          bedrooms: bedroomsIdx >= 0 ? parseInt(cols[bedroomsIdx], 10) || null : null,
          bathrooms: bathroomsIdx >= 0 ? parseFloat(cols[bathroomsIdx]) || null : null,
          sqft: sqftIdx >= 0 ? parseInt(cols[sqftIdx], 10) || null : null,
          description: descriptionIdx >= 0 ? cols[descriptionIdx] : null,
        }
      })

      const res = await fetch('/api/listings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listings }),
      })

      const data: ImportResponse = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Import failed')

      const parts: string[] = []
      if ((data.imported ?? 0) > 0) parts.push(`+${data.imported} imported`)
      setResult(parts.length > 0 ? parts.join(' · ') : 'Import complete')
      setStatus('done')
      router.refresh()
      setTimeout(() => { setStatus('idle'); setResult(null); if (fileInputRef.current) fileInputRef.current.value = '' }, 4000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed'
      setResult(message)
      setStatus('error')
      console.error(err)
      setTimeout(() => { setStatus('idle'); setResult(null); if (fileInputRef.current) fileInputRef.current.value = '' }, 4000)
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
        disabled={status === 'loading'}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-9 px-3 text-xs gap-1.5"
        onClick={() => fileInputRef.current?.click()}
        disabled={status === 'loading'}
        title="Import listings from CSV file (address, price, bedrooms, bathrooms, sqft, description)"
      >
        {status === 'loading' && <Upload className="h-3.5 w-3.5 animate-pulse" />}
        {status === 'done' && <CheckCircle className="h-3.5 w-3.5 text-green-600" />}
        {status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
        {status === 'idle' && <Upload className="h-3.5 w-3.5" />}
        {result ?? 'Import CSV'}
      </Button>
    </>
  )
}
