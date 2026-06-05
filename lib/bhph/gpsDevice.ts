import { z } from 'zod'

export const GPS_VENDOR_PRESETS = [
  'PassTime',
  'GPS Trackit',
  'Spireon',
  'CalAmp',
  'Ituran',
  'Other',
] as const

export type BhphGpsDeviceFields = {
  gps_vendor: string | null
  gps_device_id: string | null
  gps_installed_at: string | null
  gps_notes: string | null
}

export function localTodayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform(v => {
      const t = v?.trim()
      return t ? t : null
    })

export const BhphGpsPatchSchema = z.object({
  gps_vendor: optionalTrimmed(120),
  gps_device_id: optionalTrimmed(120),
  gps_installed_at: z
    .string()
    .optional()
    .refine(v => !v || !v.trim() || /^\d{4}-\d{2}-\d{2}$/.test(v.trim()), {
      message: 'Use YYYY-MM-DD for install date',
    })
    .transform(v => {
      const t = v?.trim()
      return t ? t : null
    }),
  gps_notes: optionalTrimmed(2000),
})

export type BhphGpsPatchInput = z.infer<typeof BhphGpsPatchSchema>

/** True when any GPS field has a value (for display badges). */
export function hasGpsDeviceRecorded(fields: BhphGpsDeviceFields): boolean {
  return !!(
    fields.gps_vendor?.trim() ||
    fields.gps_device_id?.trim() ||
    fields.gps_installed_at ||
    fields.gps_notes?.trim()
  )
}

export function normalizeGpsPatch(input: BhphGpsPatchInput): BhphGpsDeviceFields {
  const parsed = BhphGpsPatchSchema.parse(input)
  return {
    gps_vendor: parsed.gps_vendor,
    gps_device_id: parsed.gps_device_id,
    gps_installed_at: parsed.gps_installed_at,
    gps_notes: parsed.gps_notes,
  }
}
