/**
 * Structured server-side logger.
 * Writes JSON to stderr (captured by Vercel logs).
 * Fires a push notification for fatal-level errors.
 */

type Severity = 'info' | 'warn' | 'error' | 'fatal'

interface LogEntry {
  ts:       string
  level:    Severity
  context:  string
  message:  string
  meta?:    Record<string, unknown>
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { error: error.message, stack: error.stack }
  }
  return { error: String(error) }
}

function log(level: Severity, context: string, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    ts:      new Date().toISOString(),
    level,
    context,
    message,
    ...(meta ? { meta } : {}),
  }
  // Vercel captures console.error to stderr; all structured logs use the same channel
  console.error(JSON.stringify(entry))
}

export const logger = {
  info:  (ctx: string, msg: string, meta?: Record<string, unknown>) => log('info',  ctx, msg, meta),
  warn:  (ctx: string, msg: string, meta?: Record<string, unknown>) => log('warn',  ctx, msg, meta),
  error: (ctx: string, error: unknown, meta?: Record<string, unknown>) => {
    log('error', ctx, error instanceof Error ? error.message : String(error), {
      ...formatError(error),
      ...meta,
    })
  },
  fatal: (ctx: string, error: unknown, meta?: Record<string, unknown>) => {
    log('fatal', ctx, error instanceof Error ? error.message : String(error), {
      ...formatError(error),
      ...meta,
    })
    // Fire push notification for fatal errors (non-blocking)
    import('@/lib/push/send').then(({ sendLeadNotification }) => {
      sendLeadNotification({
        title: `Fatal error: ${ctx}`,
        body:  error instanceof Error ? error.message.slice(0, 100) : String(error).slice(0, 100),
        url:   '/settings',
      }).catch((pushErr: unknown) => {
        console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', context: 'logger.fatal', message: 'push notification failed', error: String(pushErr) }))
      })
    }).catch((importErr: unknown) => {
      console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'error', context: 'logger.fatal', message: 'push import failed', error: String(importErr) }))
    })
  },
}
