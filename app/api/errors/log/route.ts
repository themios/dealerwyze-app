import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/errors/errorLog'

/**
 * POST /api/errors/log
 *
 * Log a client-side error. Public endpoint (no auth required) to allow error
 * logging even when auth is broken. Sends alerts to platform owner.
 *
 * Request body:
 * {
 *   message: string
 *   stack_trace?: string
 *   severity?: 'error' | 'warning' | 'critical'
 *   url?: string
 *   digest?: string
 *   context?: Record<string, unknown>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      message?: string
      stack_trace?: string
      severity?: string
      url?: string
      digest?: string
      context?: Record<string, unknown>
    }

    if (!body.message) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    // Validate severity
    const severity = ['error', 'warning', 'critical'].includes(body.severity || '')
      ? (body.severity as 'error' | 'warning' | 'critical')
      : 'error'

    await logError({
      message: body.message,
      stack_trace: body.stack_trace,
      severity,
      url: body.url,
      digest: body.digest,
      context: body.context,
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[errors/log] unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
