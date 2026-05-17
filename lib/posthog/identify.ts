import posthog from 'posthog-js'

export function identifyOrgSession(orgId: string, role: string, planTier?: string) {
  if (typeof window === 'undefined') return
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

  posthog.identify(orgId, {
    role,
    ...(planTier ? { plan_tier: planTier } : {}),
  })

  posthog.group('organization', orgId, {
    role,
    ...(planTier ? { plan_tier: planTier } : {}),
  })
}

export function resetPostHogSession() {
  if (typeof window === 'undefined') return
  posthog.reset()
}

