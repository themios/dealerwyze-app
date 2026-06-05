'use client'

import { Suspense } from 'react'
import ShowingsDashboard, { type ShowingRequest } from './ShowingsDashboard'
import type { ShowingCustomerDossier } from '@/components/showings/ShowingDossierPanel'

interface Props {
  initialShowings: ShowingRequest[]
  customersById: Record<string, ShowingCustomerDossier>
}

export default function ShowingsDashboardLoader(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading showings…
        </div>
      }
    >
      <ShowingsDashboard {...props} />
    </Suspense>
  )
}
