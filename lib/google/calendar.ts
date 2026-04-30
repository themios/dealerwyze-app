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
  startIso?:   string   // "YYYY-MM-DD HH:mm" in PT
  startDateTimeIso?: string // absolute ISO datetime
  durationMin?: number  // default 60
}

export interface CreatedCalendarEvent {
  htmlLink: string | null
  eventId: string | null
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
): Promise<CreatedCalendarEvent> {
  let refreshToken: string | null = null
  const locationMap: Record<string, string> = {}

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
    return { htmlLink: null, eventId: null }
  }

  try {
    const calendar = makeCalendarClient(refreshToken)
    const duration = input.durationMin ?? 60

    let start: Date
    if (input.startDateTimeIso) {
      start = new Date(input.startDateTimeIso)
    } else if (input.startIso) {
      // Parse "YYYY-MM-DD HH:mm" as LA local time
      start = new Date(`${input.startIso.replace(' ', 'T')}:00-08:00`)
    } else {
      throw new Error('Missing calendar event start time')
    }

    if (isNaN(start.getTime())) {
      throw new Error('Invalid calendar event start time')
    }

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

    return {
      htmlLink: res.data.htmlLink ?? null,
      eventId: res.data.id ?? null,
    }
  } catch (err) {
    console.error('[calendar] Failed to create event:', err)
    return { htmlLink: null, eventId: null }
  }
}

export interface CalendarEvent {
  id:          string
  summary:     string
  description: string | null
  location:    string | null
  startIso:    string   // ISO 8601
  endIso:      string
  htmlLink:    string | null
}

/**
 * Reads upcoming events from the org's primary Google Calendar.
 * Returns up to `maxResults` events starting from `fromIso` (default: now).
 * Returns [] if org has no calendar token or on API failure.
 */
export async function getCalendarEvents(
  orgId: string,
  options: { fromIso?: string; maxResults?: number } = {},
): Promise<CalendarEvent[]> {
  const supabase = createServiceClient()
  const { data: tokens } = await supabase
    .from('org_google_tokens')
    .select('calendar_refresh_token')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!tokens?.calendar_refresh_token) return []

  try {
    const calendar = makeCalendarClient(tokens.calendar_refresh_token)
    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      options.fromIso ?? new Date().toISOString(),
      maxResults:   options.maxResults ?? 20,
      singleEvents: true,
      orderBy:      'startTime',
    })

    return (res.data.items ?? []).map(ev => ({
      id:          ev.id ?? '',
      summary:     ev.summary ?? '(No title)',
      description: ev.description ?? null,
      location:    ev.location ?? null,
      startIso:    ev.start?.dateTime ?? ev.start?.date ?? '',
      endIso:      ev.end?.dateTime   ?? ev.end?.date   ?? '',
      htmlLink:    ev.htmlLink ?? null,
    }))
  } catch (err) {
    console.error('[calendar] getCalendarEvents failed:', err)
    return []
  }
}
