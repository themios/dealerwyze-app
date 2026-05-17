'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <p className="text-2xl mb-2">Something went wrong</p>
      <p className="text-sm text-muted-foreground mb-6">
        We ran into an unexpected error. Our team has been notified.
      </p>
      <Button onClick={reset} variant="outline">Try again</Button>
    </div>
  )
}

