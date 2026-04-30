'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type FontSize = 'sm' | 'md' | 'lg' | 'xl'
const OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'X-Large' },
]

export default function FontSizeSetting() {
  const [size, setSize] = useState<FontSize>(() => {
    if (typeof document === 'undefined') return 'md'
    const current = document.documentElement.getAttribute('data-font-size')
    return current === 'sm' || current === 'md' || current === 'lg' || current === 'xl' ? current : 'md'
  })

  function apply(s: FontSize) {
    setSize(s)
    localStorage.setItem('dealerwyze-font-size', s)
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
