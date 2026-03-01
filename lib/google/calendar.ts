import { google } from 'googleapis'

function getCalendarClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  )
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_CALENDAR_REFRESH_TOKEN })
  return google.calendar({ version: 'v3', auth: oauth2 })
}

export interface CalendarEventInput {
  summary:     string   // event title
  description: string   // body/notes
  location?:   string   // e.g. "El Monte" or "Simi Valley"
  startIso:    string   // "YYYY-MM-DD HH:mm" in PT
  durationMin?: number  // default 60
}

/**
 * Creates an event on Tim's primary Google Calendar.
 * Returns the event URL or null on failure.
 */
export async function createCalendarEvent(input: CalendarEventInput): Promise<string | null> {
  const calendarRefreshToken = process.env.GMAIL_CALENDAR_REFRESH_TOKEN
  if (!calendarRefreshToken) {
    console.warn('[calendar] GMAIL_CALENDAR_REFRESH_TOKEN not set — skipping')
    return null
  }

  try {
    const calendar = getCalendarClient()
    const duration = input.durationMin ?? 60

    // Parse "YYYY-MM-DD HH:mm" as LA local time
    const start = new Date(`${input.startIso.replace(' ', 'T')}:00-08:00`)
    const end   = new Date(start.getTime() + duration * 60_000)

    const locationMap: Record<string, string> = {
      'El Monte':   '4108 Tyler Ave, El Monte, CA 91731',
      'Simi Valley': '2222 Tapo Canyon Rd, Simi Valley, CA 93063',
    }
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
