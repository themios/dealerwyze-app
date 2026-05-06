import type { PublicVehicleDownload } from '@/lib/vehicles/publicVehicleDocuments'

export default function PublicVehicleReportDownloads({ docs }: { docs: PublicVehicleDownload[] }) {
  if (docs.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-1">Reports & documents</h2>
      <p className="text-xs text-gray-500 mb-3">From the dealer — opens in a new tab. Not a substitute for your own inspection.</p>
      <ul className="space-y-2.5">
        {docs.map(d => (
          <li key={d.id}>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-col sm:flex-row sm:items-baseline sm:gap-2 text-sm font-medium text-[var(--dp-navy)] underline underline-offset-2 hover:opacity-90"
            >
              <span>{d.label}</span>
              <span className="text-xs font-normal text-gray-500">{d.file_name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
