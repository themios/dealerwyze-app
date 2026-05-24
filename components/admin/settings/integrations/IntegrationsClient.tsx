'use client'

import { useMemo, useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'

type Integration = {
  key: string
  label: string
  status: 'ok' | 'partial' | 'missing'
  vars: Array<{ name: string; present: boolean }>
}

interface IntegrationsClientProps {
  integrations: Integration[]
}

export default function IntegrationsClient({ integrations }: IntegrationsClientProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  const summary = useMemo(() => {
    const ok = integrations.filter(i => i.status === 'ok').length
    const partial = integrations.filter(i => i.status === 'partial').length
    const missing = integrations.filter(i => i.status === 'missing').length
    return { ok, partial, missing }
  }, [integrations])

  function toggleExpanded(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function borderClass(status: Integration['status']) {
    if (status === 'ok') return 'border-green-500/30'
    if (status === 'partial') return 'border-yellow-500/30'
    return 'border-[#1B4A8A]/30'
  }

  function badgeClass(status: Integration['status']) {
    if (status === 'ok') return 'bg-green-500/20 text-green-300'
    if (status === 'partial') return 'bg-yellow-500/20 text-yellow-300'
    return 'bg-white/10 text-white/60'
  }

  function badgeLabel(status: Integration['status']) {
    if (status === 'ok') return 'Connected'
    if (status === 'partial') return 'Partial'
    return 'Not configured'
  }

  return (
    <div className="p-6 max-w-4xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Integrations"
        description="Environment variable health check for all third-party services. Values are never shown."
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded-full text-xs bg-green-500/20 text-green-300">
          {summary.ok} Connected
        </span>
        <span className="px-2 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-300">
          {summary.partial} Partial
        </span>
        <span className="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-300">
          {summary.missing} Not configured
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {integrations.map(integration => {
          const expanded = expandedKeys.has(integration.key)
          return (
            <button
              key={integration.key}
              type="button"
              onClick={() => toggleExpanded(integration.key)}
              className={`bg-[#0a1628] border rounded-xl p-4 text-left ${borderClass(integration.status)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-white/50 text-xs">{expanded ? '▾' : '▸'}</span>
                  <p className="text-white font-medium text-sm">{integration.label}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${badgeClass(integration.status)}`}>
                  {badgeLabel(integration.status)}
                </span>
              </div>

              {expanded ? (
                <div className="mt-2 space-y-1">
                  {integration.vars.map(item => (
                    <div key={item.name} className="flex items-center gap-2 text-xs text-white/50">
                      <span className={item.present ? 'text-green-400' : 'text-red-400/70'}>
                        {item.present ? '✓' : '✗'}
                      </span>
                      <span className="font-mono text-white/40">{item.name}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
