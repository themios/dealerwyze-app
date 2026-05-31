/**
 * Create a Google Calendar event when a showing is confirmed.
 * Uses agent's Google Calendar OAuth tokens from org_settings.
 */

import { createServiceClient } from '@/lib/supabase/service'

interface CreateShowingEventParams {
  orgId: string
  agentId: string
  showingRequestId: string
  buyerName: string
  buyerPhone: string | null
  buyerEmail: string | null
  address: string
  confirmedTime: string
  message?: string | null
}

/**
 * Create a Google Calendar event for a confirmed showing.
 * Returns the event ID if successful, or null if Google Calendar isn't set up.
 */
export async function createShowingCalendarEvent(
  params: CreateShowingEventParams
): Promise<string | null> {
  const {
    orgId,
    agentId,
    showingRequestId,
    buyerName,
    buyerPhone,
    buyerEmail,
    address,
    confirmedTime,
    message,
  } = params

  try {
    const supabase = createServiceClient()

    // Get agent's Google Calendar tokens
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('gmail_access_token, gmail_token_expiry')
      .eq('org_id', orgId)
      .maybeSingle()

    if (!orgSettings?.gmail_access_token) {
      // Google Calendar not configured for this org
      return null
    }

    // Build event details
    const startTime = new Date(confirmedTime)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000) // 1 hour duration
    const description = [
      `Buyer: ${buyerName}`,
      buyerPhone ? `Phone: ${buyerPhone}` : null,
      buyerEmail ? `Email: ${buyerEmail}` : null,
      message ? `Notes: ${message}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const calendarEvent = {
      summary: `Showing @ ${address}`,
      description,
      location: address,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'notification', minutes: 1440 }, // 24 hours before
        ],
      },
    }

    // Call Google Calendar API
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${orgSettings.gmail_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarEvent),
      }
    )

    if (!response.ok) {
      // Token might be expired; in production, refresh token would be used
      console.error(
        'Google Calendar API error:',
        response.status,
        await response.text()
      )
      return null
    }

    const data = (await response.json()) as { id: string }
    return data.id
  } catch (err) {
    console.error('Failed to create Google Calendar event:', err)
    return null
  }
}
