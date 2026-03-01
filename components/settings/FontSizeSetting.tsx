'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

type FontSize = 'sm' | 'md' | 'lg' | 'xl'
const OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'X-Large' },
]

export default function FontSizeSetting() {
  const [size, setSize] = useState<FontSize>('md')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = (localStorage.getItem('apollo-font-size') as FontSize) || 'md'
    setSize(saved)
    setMounted(true)
  }, [])

  if (!mounted) return <div className="h-9" /> // placeholder to avoid layout shift

  function apply(s: FontSize) {
    setSize(s)
    localStorage.setItem('apollo-font-size', s)
    document.documentElement.setAttribute('data-font-size', s)
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map(o => (
        <Button
          key={o.value}
          variant={size === o.value ? 'default' : 'outline'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => apply(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
