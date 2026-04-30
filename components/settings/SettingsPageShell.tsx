import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import TopBar from '@/components/layout/TopBar'
import { cn } from '@/lib/utils'

interface SettingsPageShellProps {
  title: string
  description?: string
  backHref?: string
  type?: 'form' | 'ops' | 'critical'
  headerActions?: ReactNode
  children: ReactNode
}

const WIDTH_MAP: Record<NonNullable<SettingsPageShellProps['type']>, string> = {
  form: 'max-w-3xl',
  ops: 'max-w-6xl',
  critical: 'max-w-xl',
}

export default function SettingsPageShell({
  title,
  description,
  backHref = '/settings',
  type = 'form',
  headerActions,
  children,
}: SettingsPageShellProps) {
  return (
    <div>
      <TopBar
        hideSearch
        left={(
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-white/85 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Settings</span>
          </Link>
        )}
        right={headerActions}
      />
      <div className={cn('px-4 py-6 mx-auto space-y-6', WIDTH_MAP[type])}>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
