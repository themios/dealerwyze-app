import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'

export const dynamic = 'force-dynamic'

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  const projectId = process.env.POSTHOG_PROJECT_ID
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY

  if (!host || !projectId || !apiKey) {
    return NextResponse.json({ posthog_configured: false, event_counts: [], period_days: 30 })
  }

  try {
    const res = await fetch(
      `${host.replace(/\/$/, '')}/api/projects/${projectId}/query/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            kind: 'EventsQuery',
            select: ['event', 'count()'],
            where: ['timestamp >= now() - interval 30 day'],
            groupBy: ['event'],
            orderBy: ['count() DESC'],
            limit: 50,
          },
        }),
      },
    )

    if (!res.ok) {
      return NextResponse.json({ posthog_configured: true, event_counts: [], period_days: 30 })
    }

    const json: unknown = await res.json()
    const root = json as { results?: unknown; result?: unknown } | null
    const rawResults = (root?.results ?? root?.result) as unknown
    const results: Array<[string, number]> = Array.isArray(rawResults) ? rawResults as Array<[string, number]> : []
    const event_counts = (results ?? [])
      .map(r => ({ event: String(r[0]), count: Number(r[1] ?? 0) }))
      .filter(r => r.event && Number.isFinite(r.count))

    return NextResponse.json({ posthog_configured: true, event_counts, period_days: 30 })
  } catch {
    return NextResponse.json({ posthog_configured: true, event_counts: [], period_days: 30 })
  }
}

