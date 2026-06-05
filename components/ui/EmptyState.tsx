import { type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  className?: string
}

export default function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`text-center py-16 text-muted-foreground ${className ?? ''}`}>
      <Icon className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium text-sm text-foreground">{title}</p>
      {description && <p className="text-xs mt-1">{description}</p>}
      {action && (
        <div className="mt-4 max-w-xs mx-auto px-4">
          {action.href ? (
            <Link href={action.href}>
              <Button variant="outline" className="w-full h-12 lg:h-auto lg:w-auto">{action.label}</Button>
            </Link>
          ) : (
            <Button variant="outline" onClick={action.onClick} className="w-full h-12 lg:h-auto lg:w-auto">{action.label}</Button>
          )}
        </div>
      )}
    </div>
  )
}
