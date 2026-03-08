'use client'

/**
 * DateTimePicker15 — date + time selector with minutes locked to :00/:15/:30/:45.
 * Accepts/returns a "YYYY-MM-DDTHH:MM" string (same as datetime-local).
 * Replaces native datetime-local inputs which ignore step="900" on iOS.
 */

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

function dtDate(dt: string) { return dt.slice(0, 10) }
function dtHour24(dt: string) { return parseInt(dt.slice(11, 13)) || 0 }
function dtHour12(dt: string) { const h = dtHour24(dt); return h === 0 ? 12 : h > 12 ? h - 12 : h }
function dtAmPm(dt: string): 'AM' | 'PM' { return dtHour24(dt) < 12 ? 'AM' : 'PM' }
function dtMinute(dt: string) { return parseInt(dt.slice(14, 16)) || 0 }

function withDate(dt: string, date: string) {
  const time = dt.length >= 16 ? dt.slice(11) : '10:00'
  return `${date}T${time}`
}
function withHour12(dt: string, h12: number, ampm: 'AM' | 'PM') {
  const h24 = ampm === 'AM' ? h12 % 12 : (h12 % 12) + 12
  return dt.slice(0, 11) + pad(h24) + dt.slice(13)
}
function withMinute(dt: string, m: number) {
  return dt.slice(0, 14) + pad(m)
}

export default function DateTimePicker15({ value, onChange, className }: Props) {
  // Normalize null/undefined to empty string so helpers don't choke
  const safe = value ?? ''
  const selectCls = 'text-sm border rounded-md px-2 py-2 bg-background'

  // If no date yet, build a default datetime string for the time selects to update
  function ensureDate(fn: (dt: string) => string) {
    const base = safe || new Date(Date.now() + 86400000).toISOString().slice(0, 16)
    return fn(base)
  }

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <input
        type="date"
        value={dtDate(safe)}
        onChange={e => e.target.value && onChange(withDate(safe, e.target.value))}
        className="flex-1 min-w-0 text-sm border rounded-md px-3 py-2 bg-background"
      />
      <select
        value={dtHour12(safe)}
        onChange={e => onChange(ensureDate(dt => withHour12(dt, parseInt(e.target.value), dtAmPm(dt))))}
        className={selectCls}
      >
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <select
        value={dtMinute(safe)}
        onChange={e => onChange(ensureDate(dt => withMinute(dt, parseInt(e.target.value))))}
        className={selectCls}
      >
        {[0, 15, 30, 45].map(m => (
          <option key={m} value={m}>{pad(m)}</option>
        ))}
      </select>
      <select
        value={dtAmPm(safe)}
        onChange={e => onChange(ensureDate(dt => withHour12(dt, dtHour12(dt), e.target.value as 'AM' | 'PM')))}
        className={selectCls}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}
