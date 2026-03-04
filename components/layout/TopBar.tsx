import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  left?: ReactNode
  right?: ReactNode
  className?: string
}

export default function TopBar({ title, left, right, className }: TopBarProps) {
  return (
    <header className={cn('sticky top-0 z-10 flex items-center justify-between px-3 h-12 bg-[#0D2B55] shadow-md lg:border-b lg:border-[#1B4A8A]', className)}>
      <div className="text-white">{left ?? (title ? <h1 className="text-lg font-semibold">{title}</h1> : null)}</div>
      {right && <div className="text-white flex items-center gap-1">{right}</div>}
    </header>
  )
}
