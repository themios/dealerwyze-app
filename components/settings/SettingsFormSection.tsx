import type { ReactNode } from 'react'

interface SettingsFormSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export default function SettingsFormSection({
  title,
  description,
  children,
}: SettingsFormSectionProps) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}
