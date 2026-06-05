import { z } from 'zod'

/** Postgres/Supabase timestamptz strings (e.g. +00:00) fail Zod `.datetime()`; normalize to UTC ISO. */
export const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid datetime' })
  .transform((s) => new Date(s).toISOString())
