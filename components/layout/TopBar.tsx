import { ReactNode } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  left?: ReactNode
  right?: ReactNode
  className?: string
  hideSearch?: boolean
}

export default function TopBar({ title, left, right, className, hideSearch = false }: TopBarProps) {
  return (
    <header className={cn('sticky top-0 z-10 flex items-center justify-between px-3 h-12 bg-[#0D2B55] shadow-md lg:border-b lg:border-[#1B4A8A]', className)}>
      <div className="text-white">{left ?? (title ? <h1 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1> : null)}</div>
      <div className="text-white flex items-center gap-1">
        {right}
        {!hideSearch && (
          <Link href="/search" className="p-1.5 text-white/70 hover:text-white" aria-label="Search" title="Search">
            <Search className="h-5 w-5" />
          </Link>
        )}
      </div>
    </header>
  )
}
