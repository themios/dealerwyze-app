import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import StatusChip from '@/components/settings/StatusChip'

interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  status?: 'connected' | 'error' | 'pending' | 'optional' | 'healthy'
  summary?: string
  accessBadge?: string
}

export default function SettingsLinkCard({
  href,
  icon: Icon,
  title,
  description,
  status,
  summary,
  accessBadge,
}: SettingsLinkCardProps) {
  return (
    <Link href={href}>
      <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
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
                <StatusChip tone={status} label={{ connected: 'Connected', healthy: 'Healthy', optional: 'Optional', pending: 'Needs attention', error: 'Error' }[status]} />
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
