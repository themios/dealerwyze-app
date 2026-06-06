'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)

    // Also log to our error database
    fetch('/api/errors/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack_trace: error.stack,
        severity: 'critical',
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        digest: error.digest,
        context: {
          errorName: error.name,
          timestamp: new Date().toISOString(),
          isGlobalError: true,
        },
      }),
    }).catch(err => console.error('[errorLog] failed to log:', err))
  }, [error])

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Application error</h2>
          <p>Our team has been notified. Please refresh the page.</p>
          <button onClick={reset}>Refresh</button>
        </div>
      </body>
    </html>
  )
}

