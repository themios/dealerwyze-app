import { google } from 'googleapis'
import { createServiceClient } from '@/lib/supabase/service'

function makeCalendarClient(refreshToken: string) {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: refreshToken })
  return google.calendar({ version: 'v3', auth: oauth2 })
}

export interface CalendarEventInput {
  summary:     string   // event title
  description: string   // body/notes
  location?:   string   // location name from AI summary
  startIso:    string   // "YYYY-MM-DD HH:mm" in PT
  durationMin?: number  // default 60
}

/**
 * Creates an event on the org's Google Calendar.
 * Looks up per-org calendar_refresh_token in org_google_tokens (DB-only — no env var fallback).
 * Address is resolved from org_settings.locations JSONB (array of { name, address }).
 * Returns the event URL or null on failure.
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
  orgId?: string,
): Promise<string | null> {
  let refreshToken: string | null = null
  let locationMap: Record<string, string> = {}

  if (orgId) {
    const supabase = createServiceClient()

    // Per-org Google Calendar token
    const { data: tokens } = await supabase
      .from('org_google_tokens')
      .select('calendar_refresh_token')
      .eq('org_id', orgId)
      .maybeSingle()
    if (tokens?.calendar_refresh_token) refreshToken = tokens.calendar_refresh_token

    // Dynamic address map from org_settings.locations
    const { data: settings } = await supabase
      .from('org_settings')
      .select('locations')
      .eq('org_id', orgId)
      .maybeSingle()

    const locations = settings?.locations as Array<{ name: string; address: string }> | null
    if (locations) {
      for (const loc of locations) {
        if (loc.name && loc.address) locationMap[loc.name] = loc.address
      }
    }
  }

  if (!refreshToken) {
    console.warn('[calendar] No refresh token available — skipping')
    return null
  }

  try {
    const calendar = makeCalendarClient(refreshToken)
    const duration = input.durationMin ?? 60

    // Parse "YYYY-MM-DD HH:mm" as LA local time
    const start = new Date(`${input.startIso.replace(' ', 'T')}:00-08:00`)
    const end   = new Date(start.getTime() + duration * 60_000)

    const locationStr = input.location
      ? (locationMap[input.location] ?? input.location)
      : undefined

    const res = await calendar.events.insert({
      calendarId:  'primary',
      requestBody: {
        summary:     input.summary,
        description: input.description,
        location:    locationStr,
        start: { dateTime: start.toISOString(), timeZone: 'America/Los_Angeles' },
        end:   { dateTime: end.toISOString(),   timeZone: 'America/Los_Angeles' },
        reminders: {
          useDefault: false,
          overrides:  [{ method: 'popup', minutes: 60 }],
        },
      },
    })

    return res.data.htmlLink ?? null
  } catch (err) {
    console.error('[calendar] Failed to create event:', err)
    return null
  }
}
