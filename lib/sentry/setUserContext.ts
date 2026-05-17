import * as Sentry from '@sentry/nextjs'

export function setSentryUserContext(orgId: string, role: string) {
  Sentry.setUser({
    id: orgId,
    segment: role,
  })
}

export function clearSentryUser() {
  Sentry.setUser(null)
}

