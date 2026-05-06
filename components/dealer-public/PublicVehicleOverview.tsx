import type { OverviewSection } from '@/lib/vehicles/overviewSections'

export default function PublicVehicleOverview({ sections }: { sections: OverviewSection[] }) {
  if (sections.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between mb-4">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Overview</h2>
        <p className="text-[10px] text-gray-500">
          From the dealer — confirm important details in person
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {sections.map((sec, i) => {
          const useProseBlock = sec.lines.length === 1 && sec.lines[0].length > 240
          const hideRedundantHeading =
            sections.length === 1 && sec.heading.trim().toLowerCase() === 'overview'
          return (
            <section key={i} className="pt-4 first:pt-0">
              {!hideRedundantHeading ? (
                <h3 className="text-sm font-semibold text-[var(--dp-navy)] mb-2 leading-snug">{sec.heading}</h3>
              ) : null}
              {useProseBlock ? (
                <p className="text-sm text-gray-800 leading-relaxed">{sec.lines[0]}</p>
              ) : (
                <ul className="space-y-2 list-none">
                  {sec.lines.map((line, j) => (
                    <li
                      key={j}
                      className="text-sm text-gray-800 leading-snug pl-3 border-l-2 border-[var(--dp-gold)]/50"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
