import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { isDealerAdmin } from '@/types/index'

export default async function PendingPage() {
  const profile = await requireProfile()

  // Platform staff and superadmins never land here
  if (profile.platform_role === 'platform_staff') redirect('/admin')

  // Non-admin dealer roles shouldn't hit this either
  if (!isDealerAdmin(profile.role)) redirect('/today')

  const service = createServiceClient()
  const { data: org } = await service
    .from('organizations')
    .select('name, approved_at, rejection_reason')
    .eq('id', profile.org_id)
    .single()

  // Already approved — proceed to app
  if (org?.approved_at) redirect('/today')

  const isRejected = !!org?.rejection_reason

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl">{isRejected ? '❌' : '⏳'}</div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRejected ? 'Application Not Approved' : 'Application Under Review'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {org?.name ?? 'Your dealership'}
          </p>
        </div>

        {isRejected ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-medium text-destructive">Reason provided:</p>
            <p className="text-sm text-muted-foreground">{org?.rejection_reason}</p>
            <p className="text-sm text-muted-foreground mt-3">
              Please contact{' '}
              <a href="mailto:support@dealerwyze.com" className="underline text-foreground">
                support@dealerwyze.com
              </a>{' '}
              if you have questions.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Your DealerWyze account is pending review by our team. You'll receive an email once
              your account is approved — typically within 1 business day.
            </p>
            <div className="border-t pt-4 space-y-1 text-xs text-muted-foreground">
              <p>Questions? Email us at{' '}
                <a href="mailto:support@dealerwyze.com" className="underline text-foreground">
                  support@dealerwyze.com
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
