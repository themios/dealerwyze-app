import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  /** Add top divider — true for every item after the first in a group */
  divider?: boolean
  status?: 'connected' | 'error' | 'pending' | 'optional' | 'healthy'
  summary?: string
  accessBadge?: string
}

const STATUS_STYLES: Record<NonNullable<SettingsLinkCardProps['status']>, string> = {
  connected: 'bg-green-100 text-green-700',
  healthy: 'bg-emerald-100 text-emerald-700',
  optional: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
}

export default function SettingsLinkCard({
  href,
  icon: Icon,
  title,
  description,
  divider = false,
  status,
  summary,
  accessBadge,
}: SettingsLinkCardProps) {
  return (
    <Link href={href}>
      <div
        className={`flex items-center justify-between p-4 hover:bg-accent transition-colors${
          divider ? ' border-t border-border' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-primary" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{title}</p>
              {accessBadge ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {accessBadge}
                </span>
              ) : null}
              {status ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[status]}`}>
                  {status.replace('_', ' ')}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            {summary ? (
              <p className="text-[11px] text-muted-foreground mt-1">{summary}</p>
            ) : null}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}
