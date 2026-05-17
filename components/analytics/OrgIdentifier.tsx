'use client'

import { useEffect } from 'react'
import { identifyOrgSession } from '@/lib/posthog/identify'

interface Props {
  orgId: string
  role: string
  planTier?: string
}

export default function OrgIdentifier({ orgId, role, planTier }: Props) {
  useEffect(() => {
    identifyOrgSession(orgId, role, planTier)
  }, [orgId, role, planTier])

  return null
}

