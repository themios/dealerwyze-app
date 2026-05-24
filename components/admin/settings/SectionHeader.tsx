interface SectionHeaderProps {
  title: string
  description?: string
  updatedAt?: string | null
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function SectionHeader({ title, description, updatedAt }: SectionHeaderProps) {
  const formattedUpdatedAt = updatedAt ? formatUpdatedAt(updatedAt) : null

  return (
    <div className="border-b border-[#1B4A8A]/30 pb-4 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description ? (
            <p className="text-white/50 text-sm mt-1">{description}</p>
          ) : null}
        </div>
        {formattedUpdatedAt ? (
          <p className="text-white/30 text-xs text-right">Last saved: {formattedUpdatedAt}</p>
        ) : null}
      </div>
    </div>
  )
}
