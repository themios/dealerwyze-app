'use client'

import { useState } from 'react'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import FlagRow from '@/components/admin/settings/features/FlagRow'

type FlagType = {
  id: string
  flag_key: string
  display_name: string
  description: string | null
  enabled_globally: boolean
  enabled_for_plans: string[]
  kill_switch: boolean
  updated_at: string | null
}

interface FeatureFlagsClientProps {
  flags: FlagType[]
}

export default function FeatureFlagsClient({ flags }: FeatureFlagsClientProps) {
  const [localFlags, setLocalFlags] = useState<FlagType[]>(flags)

  return (
    <div className="p-6 max-w-4xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Feature Flags"
        description="Control feature availability globally and by plan. Kill switch overrides all other settings."
      />
      <div className="space-y-3">
        {localFlags.map(flag => (
          <FlagRow
            key={flag.flag_key}
            flag={flag}
            onUpdated={updated =>
              setLocalFlags(prev => prev.map(f => (f.flag_key === updated.flag_key ? updated : f)))
            }
          />
        ))}
      </div>
    </div>
  )
}
