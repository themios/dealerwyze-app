import { usePostHog } from 'posthog-js/react'
import { useCallback } from 'react'

export type AnalyticsEvent =
  | { event: 'lead_created'; props: { source?: string } }
  | { event: 'customer_viewed'; props: { section?: 'activity' | 'details' | 'vehicle' } }
  | { event: 'customer_searched'; props: Record<string, never> }
  | { event: 'appointment_scheduled'; props: { from_screen: string } }
  | { event: 'appointment_edited'; props: { from_screen: string } }
  | { event: 'appointment_deleted'; props: { from_screen: string } }
  | { event: 'sms_sent'; props: { template_used: boolean } }
  | { event: 'email_sent'; props: { template_used: boolean } }
  | { event: 'call_initiated'; props: Record<string, never> }
  | { event: 'sequence_started'; props: { step_count: number } }
  | { event: 'sequence_paused'; props: Record<string, never> }
  | { event: 'vehicle_added'; props: { has_photos: boolean } }
  | { event: 'vehicle_sold'; props: Record<string, never> }
  | { event: 'vehicle_photo_uploaded'; props: { count: number } }
  | { event: 'receipt_scanned'; props: { has_ai_parse: boolean } }
  | { event: 'ledger_transaction_created'; props: { has_vehicle: boolean } }
  | { event: 'ledger_transaction_edited'; props: Record<string, never> }
  | { event: 'calendar_viewed'; props: { view: 'month' | 'week' | 'day' } }
  | { event: 'ai_brief_generated'; props: { tokens_used: number; cached: boolean } }
  | { event: 'ai_brief_viewed'; props: Record<string, never> }
  | { event: 'settings_saved'; props: { section: string } }
  | { event: 'onboarding_step_completed'; props: { step: string } }
  | { event: 'onboarding_completed'; props: Record<string, never> }

export function useAnalytics() {
  const posthog = usePostHog()

  const track = useCallback(<E extends AnalyticsEvent>(e: E) => {
    if (!posthog) return
    posthog.capture(e.event, (e as { props: Record<string, unknown> }).props)
  }, [posthog])

  return { track }
}

