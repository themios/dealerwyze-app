import { NextRequest, NextResponse } from 'next/server'
import { getOrgIdByPhone } from '@/lib/orgs/lookup'
import { searchInventory, getVehicleDetails } from '@/lib/voice/inventoryTools'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * Retell AI tool-call webhook.
 * Configure in Retell dashboard → Tool Call Webhook URL:
 *   https://dealerwyze.com/api/voice/tools
 *   Custom header: x-retell-tool-secret: <value of RETELL_TOOL_SECRET env var>
 *
 * Retell sends:
 *   { event: "tool_call", call: {...}, tool_call_list: [{ tool_call_id, name, arguments }] }
 *
 * We respond:
 *   [{ tool_call_id, content: "..." }]
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth check — secret must be in header, not URL (prevents secret appearing in logs)
  const provided = Buffer.from(req.headers.get('x-retell-tool-secret') ?? '')
  const expected = Buffer.from(process.env.RETELL_TOOL_SECRET ?? '')
  if (
    expected.length === 0 ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: {
    event?: string
    call?: { to_number?: string }
    tool_call_list?: Array<{ tool_call_id: string; name: string; arguments: Record<string, unknown> }>
  }

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle tool_call events — other event types (call_started, call_ended) get an empty ack
  if (payload.event && payload.event !== 'tool_call') {
    return NextResponse.json([])
  }

  const toolCalls = payload.tool_call_list ?? []

  const toNumber = payload.call?.to_number ?? ''
  const orgId = await getOrgIdByPhone(toNumber)

  if (!orgId) {
    console.error('[voice/tools] could not resolve orgId for number:', toNumber)
    // Return a fallback result for every tool call so Retell can correlate responses
    return NextResponse.json(
      toolCalls.map(tc => ({ tool_call_id: tc.tool_call_id, content: 'Inventory lookup unavailable right now.' }))
    )
  }

  const results = await Promise.all(
    toolCalls.map(async (tc) => {
      let content: string

      try {
        if (tc.name === 'search_inventory') {
          content = await searchInventory(orgId, {
            make:      tc.arguments.make      as string | undefined,
            model:     tc.arguments.model     as string | undefined,
            year_min:  tc.arguments.year_min  as number | undefined,
            year_max:  tc.arguments.year_max  as number | undefined,
            max_price: tc.arguments.max_price as number | undefined,
            min_price: tc.arguments.min_price as number | undefined,
            color:     tc.arguments.color     as string | undefined,
          })
        } else if (tc.name === 'get_vehicle_details') {
          const stockNo = (tc.arguments.stock_no as string) ?? ''
          content = await getVehicleDetails(orgId, stockNo)
        } else {
          content = `Unknown tool: ${tc.name}`
        }
      } catch (err) {
        console.error(`[voice/tools] error handling ${tc.name}:`, err)
        content = 'An error occurred looking that up.'
      }

      return { tool_call_id: tc.tool_call_id, content }
    })
  )

  return NextResponse.json(results)
}
