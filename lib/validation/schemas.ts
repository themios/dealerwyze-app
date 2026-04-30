import { z } from 'zod'
import { NextResponse } from 'next/server'

// ── Shared field types ────────────────────────────────────────────────────────

const phone = z.string().trim().min(7).max(20).regex(/^[+\d\s().,-]+$/, 'Invalid phone number')
const email = z.string().trim().email().max(254)
const name  = z.string().trim().min(1).max(120)

// ── Public route schemas ──────────────────────────────────────────────────────

export const WebLeadSchema = z.object({
  slug:       z.string().trim().min(1).max(80),
  name:       name,
  phone:      phone.optional(),
  email:      email.optional(),
  message:    z.string().trim().max(2000).optional(),
  source_url: z.string().url().max(2048).optional(),
  vdp:        z.string().trim().max(200).optional(),
  website:    z.string().max(200).optional(), // honeypot — present = bot
}).refine(d => d.phone || d.email, {
  message: 'At least one of phone or email is required',
  path: ['phone'],
})

export const BookingSchema = z.object({
  name:    name,
  phone:   phone,
  email:   email.optional(),
  date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time:    z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM'),
  notes:   z.string().trim().max(1000).optional(),
  website: z.string().max(200).optional(), // honeypot — present = bot
})

export const PayTokenPostSchema = z.union([
  z.object({ action: z.literal('intent').optional() }),
  z.object({
    action:             z.literal('confirm'),
    payment_intent_id:  z.string().trim().min(1).max(100),
  }),
])

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Parse and validate request JSON against a Zod schema.
 * Returns { data } on success or { errorResponse } on failure.
 * Never exposes internal details — returns structured 400 with field-level errors.
 */
export async function parseBody<T>(
  req: Request,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; errorResponse?: never } | { data?: never; errorResponse: Response }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { errorResponse: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const fields = result.error.issues.map(i => ({
      field: i.path.join('.'),
      message: i.message,
    }))
    return { errorResponse: NextResponse.json({ error: 'Validation failed', fields }, { status: 400 }) }
  }

  return { data: result.data }
}
