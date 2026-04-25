import { NextResponse } from 'next/server'

/**
 * Standard API error response. Always uses { error: string } shape.
 *
 * @param message  Plain English message — no jargon, no internal IDs, no stack traces
 * @param status   HTTP status code (default 400)
 *
 * @example
 *   return apiError('Customer not found', 404)
 */
export function apiError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

/**
 * Standard API success response.
 *
 * @param data    Any JSON-serializable payload
 * @param status  HTTP status code (default 200)
 *
 * @example
 *   return apiOk({ id: customer.id })
 *   return apiOk({ ok: true }, 201)
 */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}
