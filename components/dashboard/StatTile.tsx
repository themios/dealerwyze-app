import Link from 'next/link'

interface StatRow {
  label: string
  value: string | number
  color?: 'red' | 'amber' | 'green' | 'blue' | 'default'
}

interface Props {
  href: string
  title: string
  primary: string | number
  primarySub?: string
  stats?: StatRow[]
  alert?: string        // red text shown if set
  footer?: string
  fullWidth?: boolean
  onClick?: () => void  // for non-link tiles (e.g. Morning Brief)
}

const colorMap: Record<string, string> = {
  red:     'text-red-500',
  amber:   'text-amber-500',
  green:   'text-green-600',
  blue:    'text-blue-500',
  default: 'text-muted-foreground',
}

function TileContent({ title, primary, primarySub, stats, alert, footer }: Omit<Props, 'href' | 'fullWidth' | 'onClick'>) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{title}</p>
      <div>
        <span className="text-3xl font-black text-foreground tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>{primary}</span>
        {primarySub && <span className="text-xs text-muted-foreground ml-1.5">{primarySub}</span>}
      </div>
      {alert && (
        <p className="text-xs font-medium text-red-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block flex-shrink-0" />
          {alert}
        </p>
      )}
      {stats && stats.length > 0 && (
        <div className="space-y-1">
          {stats.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className={`text-xs font-semibold ${colorMap[s.color ?? 'default']}`}>{s.value}</span>
            </div>
          ))}
        </div>
      )}
      {footer && <p className="text-[10px] text-muted-foreground pt-1">{footer}</p>}
    </div>
  )
}

export default function StatTile(props: Props) {
  const { href, fullWidth, onClick, ...rest } = props
  const cls = `rounded-xl border border-border bg-card hover:bg-accent active:bg-accent/80 transition-colors cursor-pointer ${fullWidth ? 'w-full' : ''}`

  if (onClick) {
    return (
      <button className={cls + ' w-full text-left'} onClick={onClick}>
        <TileContent {...rest} />
      </button>
    )
  }
  return (
    <Link href={href} className={cls}>
      <TileContent {...rest} />
    </Link>
  )
}
