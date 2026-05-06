/**
 * Best-effort parse of dealer free-text hours into schema.org openingHours strings (e.g. Mo-Fr 09:00-19:00).
 * Returns undefined when nothing could be parsed — never throws.
 */

const WD: Record<string, string> = {
  mo: 'Mo',
  mon: 'Mo',
  monday: 'Mo',
  tu: 'Tu',
  tue: 'Tu',
  tues: 'Tu',
  tuesday: 'Tu',
  we: 'We',
  wed: 'We',
  weds: 'We',
  wednesday: 'We',
  th: 'Th',
  thu: 'Th',
  thur: 'Th',
  thurs: 'Th',
  thursday: 'Th',
  fr: 'Fr',
  fri: 'Fr',
  friday: 'Fr',
  sa: 'Sa',
  sat: 'Sa',
  saturday: 'Sa',
  su: 'Su',
  sun: 'Su',
  sunday: 'Su',
}

function normDayToken(t: string): string | null {
  const k = t.toLowerCase().replace(/\./g, '').trim()
  return WD[k] ?? null
}

/** "Mon-Fri" or "Mo-Fr" → Mo-Fr */
function parseDayRange(part: string): string | null {
  const p = part.trim().replace(/–/g, '-').replace(/^open\s+/i, '')
  const bits = p.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean)
  if (bits.length >= 2) {
    const a = normDayToken(bits[0])
    const b = normDayToken(bits[bits.length - 1])
    if (a && b) return `${a}-${b}`
  }
  const one = normDayToken(p)
  return one
}

function parseHm(s: string): { h: number; m: number } | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, '')
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = m[2] ? parseInt(m[2], 10) : 0
  const ap = m[3]
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

function formatHm(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Already schema-style: Mo-Fr 09:00-19:00 */
function trySchemaLine(line: string): string | null {
  const m = line.match(
    /^([A-Z]{2}(?:-[A-Z]{2})+)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/i,
  )
  if (!m) return null
  return `${m[1]} ${m[2]}-${m[3]}`.replace(/\s+/g, ' ')
}

function tryFriendlyLine(line: string): string | null {
  const lower = line.replace(/–/g, '-')
  const colonIdx = lower.indexOf(':')
  let days: string | null = null
  let timeStr = lower

  if (colonIdx > 0) {
    const maybeDays = lower.slice(0, colonIdx).trim()
    const maybeTimes = lower.slice(colonIdx + 1).trim()
    days = parseDayRange(maybeDays)
    if (days && maybeTimes) timeStr = maybeTimes
  }

  if (!days) {
    const m = lower.match(
      /^([a-z]+(?:\s*-\s*[a-z]+)?)\s+(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)/i,
    )
    if (m) {
      days = parseDayRange(m[1])
      timeStr = `${m[2]}-${m[3]}`
    }
  }

  if (!days) return null

  const tm = timeStr.match(/(\d{1,2}(?::\d{2})?(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?(?:am|pm)?)/i)
  if (!tm) return null
  const o1 = parseHm(tm[1])
  const o2 = parseHm(tm[2])
  if (!o1 || !o2) return null
  return `${days} ${formatHm(o1.h, o1.m)}-${formatHm(o2.h, o2.m)}`
}

export function parseHoursToSchema(hoursText: string | null | undefined): string[] | undefined {
  if (!hoursText?.trim()) return undefined
  const lines = hoursText
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const line of lines) {
    const a = trySchemaLine(line)
    if (a) {
      out.push(a)
      continue
    }
    const b = tryFriendlyLine(line)
    if (b) out.push(b)
  }
  return out.length ? out : undefined
}
