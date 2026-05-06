/**
 * Shared request validation for public / webhook routes.
 * On schema failure: throws NextResponse (400) with { error, fields } — never stack traces or raw Zod dumps.
 */

import { NextResponse } from 'next/server'
import type { ZodSchema, ZodIssue, ZodError } from 'zod'

function issuesToFields(issues: ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_root'
    if (!(key in fields)) fields[key] = issue.message
  }
  return fields
}

/** Build field map from a failed safeParse (for non-throwing call sites). */
export function validationErrorFields(error: ZodError): Record<string, string> {
  return issuesToFields(error.issues)
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const fields = issuesToFields(result.error.issues)
    throw NextResponse.json({ error: 'Validation failed', fields }, { status: 400 })
  }
  return result.data
}

/**
 * Validate URL search params as a flat record (last value wins for duplicate keys).
 * Throws NextResponse.json 400 on validation failure.
 */
export function parseSearchParams<T>(searchParams: URLSearchParams, schema: ZodSchema<T>): T {
  const obj: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    obj[key] = value
  })
  const result = schema.safeParse(obj)
  if (!result.success) {
    const fields = issuesToFields(result.error.issues)
    throw NextResponse.json({ error: 'Validation failed', fields }, { status: 400 })
  }
  return result.data
}
