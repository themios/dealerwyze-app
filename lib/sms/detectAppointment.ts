export interface AppointmentHint {
  detected: boolean
  suggestedDate: Date | null
  confidence: 'high' | 'medium' | 'low'
}

const HIGH_CONFIDENCE = [
  /\btest\s*drive\b/i,
  /\bappointment\b/i,
  /\bappt\b/i,
  /\bcome\s+in\b/i,
  /\bstop\s+by\b/i,
  /\bschedule\b/i,
  /\bbook\s+(a|an|the)?\s*(time|visit|appointment|test|slot)\b/i,
]

const MEDIUM_CONFIDENCE = [
  /\bcan\s+I\s+(come|see|visit|check|look)\b/i,
  /\bwhen\s+can\s+I\b/i,
  /\bwhen\s+are\s+you\s+open\b/i,
  /\bwhen\s+(are|is)\s+(you|it)\s+available\b/i,
  /\bcheck\s+it\s+out\b/i,
  /\blook\s+at\s+it\b/i,
  /\bwant\s+to\s+(see|view|check|come|visit)\b/i,
  /\binterested\s+in\s+(coming|seeing|visiting|looking)\b/i,
  /\bcan\s+we\s+meet\b/i,
  /\bwould\s+like\s+to\s+(come|see|visit)\b/i,
  /\bset\s+up\s+a\s+(time|visit|meeting)\b/i,
]

/**
 * Parse a suggested date/time from free-form SMS text.
 * Returns a Date or null if nothing recognisable found.
 */
function parseDate(text: string): Date | null {
  const lower = text.toLowerCase()
  const now = new Date()

  // Helper: apply time expression to a Date
  function applyTime(d: Date): Date {
    // Match: "at 2", "at 2pm", "2:30pm", "2:30 pm", "noon", "morning", "afternoon"
    if (/\bnoon\b/.test(lower)) { d.setHours(12, 0, 0, 0); return d }
    if (/\bmidnight\b/.test(lower)) { d.setHours(0, 0, 0, 0); return d }
    if (/\bmorning\b/.test(lower)) { d.setHours(10, 0, 0, 0); return d }
    if (/\bafternoon\b/.test(lower)) { d.setHours(14, 0, 0, 0); return d }
    if (/\bevening\b/.test(lower)) { d.setHours(17, 0, 0, 0); return d }

    const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
    if (m) {
      let h = parseInt(m[1])
      const min = m[2] ? parseInt(m[2]) : 0
      if (m[3] === 'pm' && h < 12) h += 12
      if (m[3] === 'am' && h === 12) h = 0
      d.setHours(h, min, 0, 0)
      return d
    }
    // Bare number "at 2" or "at 3" — ambiguous, assume PM business hours
    const bare = lower.match(/\bat\s+(\d{1,2})\b/)
    if (bare) {
      let h = parseInt(bare[1])
      if (h >= 1 && h <= 8) h += 12 // 1–8 → PM
      d.setHours(h, 0, 0, 0)
      return d
    }
    // Default to 10am
    d.setHours(10, 0, 0, 0)
    return d
  }

  // "today"
  if (/\btoday\b/.test(lower)) {
    const d = new Date(now)
    return applyTime(d)
  }

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return applyTime(d)
  }

  // "this weekend" → Saturday
  if (/this\s+weekend/.test(lower)) {
    const d = new Date(now)
    const toSat = (6 - d.getDay() + 7) % 7
    d.setDate(d.getDate() + (toSat === 0 ? 7 : toSat))
    return applyTime(d)
  }

  // Day names: "Monday", "this Monday", "next Monday"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < dayNames.length; i++) {
    const isNext = new RegExp(`next\\s+${dayNames[i]}`).test(lower)
    const isThis = new RegExp(`(?:this\\s+)?${dayNames[i]}`).test(lower)
    if (isThis || isNext) {
      const d = new Date(now)
      let diff = (i - d.getDay() + 7) % 7
      if (diff === 0 || isNext) diff += 7
      d.setDate(d.getDate() + diff)
      return applyTime(d)
    }
  }

  // "next week"
  if (/next\s+week/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 7)
    return applyTime(d)
  }

  // "this week"
  if (/this\s+week/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return applyTime(d)
  }

  return null
}

export function detectAppointment(text: string): AppointmentHint {
  for (const re of HIGH_CONFIDENCE) {
    if (re.test(text)) {
      return { detected: true, suggestedDate: parseDate(text), confidence: 'high' }
    }
  }
  for (const re of MEDIUM_CONFIDENCE) {
    if (re.test(text)) {
      return { detected: true, suggestedDate: parseDate(text), confidence: 'medium' }
    }
  }
  return { detected: false, suggestedDate: null, confidence: 'low' }
}
