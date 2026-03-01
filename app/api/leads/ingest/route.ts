import { NextRequest, NextResponse } from 'next/server'
import { ingestLead } from '@/lib/leads/ingest'
import type { ParsedLead } from '@/lib/leads/parser'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-leads-secret')
  if (secret !== process.env.LEADS_POLL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { lead: ParsedLead; external_id: string }
  const result = await ingestLead(body.lead, body.external_id)

  if ('error' in result) return NextResponse.json(result, { status: 500 })
  return NextResponse.json(result)
}
