import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

interface SettingsLinkCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
  /** Add top divider — true for every item after the first in a group */
  divider?: boolean
}

export default function SettingsLinkCard({
  href,
  icon: Icon,
  title,
  description,
  divider = false,
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
            <p className="font-medium text-sm">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  )
}
