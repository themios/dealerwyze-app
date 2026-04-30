import { NextRequest, NextResponse } from 'next/server'
import { ingestLead } from '@/lib/leads/ingest'
import type { ParsedLead } from '@/lib/leads/parser'
import { timingSafeEqual } from 'crypto'

export async function POST(req: NextRequest) {
  const provided = Buffer.from(req.headers.get('x-leads-secret') ?? '')
  const expected = Buffer.from(process.env.LEADS_POLL_SECRET ?? '')
  if (
    expected.length === 0 ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { lead: ParsedLead; external_id: string; org_id: string }
  if (!body.org_id) {
    return NextResponse.json({ error: 'Missing required field: org_id' }, { status: 400 })
  }
  const result = await ingestLead(body.lead, body.external_id, body.org_id)

  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
