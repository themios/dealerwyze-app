import { createServiceClient } from '@/lib/supabase/service'

type OutboundRow = {
  id: string
  customer_id: string | null
  type: string
  body: string | null
  created_at: string
  customer_sequence_id?: string | null
  sequence_day?: number | null
  customer?: { id: string; lead_intent_tier?: string | null } | null
}

type InboundRow = {
  customer_id: string | null
  created_at: string
}

type SequenceStepRow = {
  sequence_id: string
  sequence_name: string | null
  step_number: number
  enrolled_count: number
  silent_after_step_count: number
  silence_rate: number
}

function replyWithinDays(outboundAt: string, inboundRows: InboundRow[]): boolean {
  const start = new Date(outboundAt).getTime()
  const end = start + 7 * 86_400_000
  return inboundRows.some(row => {
    const at = new Date(row.created_at).getTime()
    return at > start && at <= end
  })
}

function firstTenWords(body: string | null): string {
  return (body ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join(' ')
}

function suppressLowSample<T extends { sampleSize: number }>(items: T[]): T[] {
  return items.filter(item => item.sampleSize >= 10)
}

export function buildMessagingPatternsFromRows(args: {
  outboundRows: OutboundRow[]
  inboundRows: InboundRow[]
  sequenceStepRows: SequenceStepRow[]
}) {
  const inboundByCustomer = new Map<string, InboundRow[]>()
  for (const row of args.inboundRows) {
    if (!row.customer_id) continue
    const list = inboundByCustomer.get(row.customer_id) ?? []
    list.push(row)
    inboundByCustomer.set(row.customer_id, list)
  }

  const responseHour = new Map<number, { sampleSize: number; replies: number }>()
  const messageLength = new Map<string, { sampleSize: number; replies: number }>()
  const firstTouch = new Map<string, { sampleSize: number; replies: number }>()
  const channelEffectiveness = new Map<string, { sampleSize: number; replies: number }>()

  const firstOutboundByCustomer = new Map<string, OutboundRow>()

  for (const row of args.outboundRows) {
    if (!row.customer_id) continue
    const inboundRows = inboundByCustomer.get(row.customer_id) ?? []
    const gotReply = replyWithinDays(row.created_at, inboundRows)
    const hour = new Date(row.created_at).getHours()
    const hourBucket = responseHour.get(hour) ?? { sampleSize: 0, replies: 0 }
    hourBucket.sampleSize++
    if (gotReply) hourBucket.replies++
    responseHour.set(hour, hourBucket)

    const lengthBucketKey =
      (row.body ?? '').length <= 50 ? '0-50'
        : (row.body ?? '').length <= 100 ? '51-100'
          : '101+'
    const lengthBucket = messageLength.get(lengthBucketKey) ?? { sampleSize: 0, replies: 0 }
    lengthBucket.sampleSize++
    if (gotReply) lengthBucket.replies++
    messageLength.set(lengthBucketKey, lengthBucket)

    const tier = row.customer?.lead_intent_tier ?? 'unknown'
    const channel = row.type.includes('sms') ? 'sms' : row.type.includes('email') ? 'email' : 'other'
    const channelKey = `${channel}:${tier}`
    const channelBucket = channelEffectiveness.get(channelKey) ?? { sampleSize: 0, replies: 0 }
    channelBucket.sampleSize++
    if (gotReply) channelBucket.replies++
    channelEffectiveness.set(channelKey, channelBucket)

    const existingFirst = firstOutboundByCustomer.get(row.customer_id)
    if (!existingFirst || new Date(row.created_at).getTime() < new Date(existingFirst.created_at).getTime()) {
      firstOutboundByCustomer.set(row.customer_id, row)
    }
  }

  for (const row of firstOutboundByCustomer.values()) {
    if (!row.customer_id) continue
    const phrase = firstTenWords(row.body)
    if (!phrase) continue
    const gotReply = replyWithinDays(row.created_at, inboundByCustomer.get(row.customer_id) ?? [])
    const bucket = firstTouch.get(phrase) ?? { sampleSize: 0, replies: 0 }
    bucket.sampleSize++
    if (gotReply) bucket.replies++
    firstTouch.set(phrase, bucket)
  }

  return {
    responseTimeBuckets: suppressLowSample(
      Array.from(responseHour.entries()).map(([hour, bucket]) => ({
        hour,
        sampleSize: bucket.sampleSize,
        replyRate: Math.round((bucket.replies / bucket.sampleSize) * 100),
      })),
    ).sort((a, b) => b.replyRate - a.replyRate),
    messageLengthBuckets: suppressLowSample(
      Array.from(messageLength.entries()).map(([bucket, values]) => ({
        bucket,
        sampleSize: values.sampleSize,
        replyRate: Math.round((values.replies / values.sampleSize) * 100),
      })),
    ),
    firstTouchPhrases: suppressLowSample(
      Array.from(firstTouch.entries()).map(([phrase, values]) => ({
        phrase,
        sampleSize: values.sampleSize,
        replyRate: Math.round((values.replies / values.sampleSize) * 100),
      })),
    ).sort((a, b) => b.replyRate - a.replyRate).slice(0, 10),
    sequenceStepDropoff: args.sequenceStepRows
      .filter(row => row.enrolled_count >= 10)
      .map(row => ({
        sequenceId: row.sequence_id,
        sequenceName: row.sequence_name ?? 'Sequence',
        stepNumber: row.step_number,
        sampleSize: row.enrolled_count,
        silenceRate: Math.round(row.silence_rate * 100),
      }))
      .sort((a, b) => b.silenceRate - a.silenceRate),
    channelEffectiveness: suppressLowSample(
      Array.from(channelEffectiveness.entries()).map(([key, values]) => {
        const [channel, tier] = key.split(':')
        return {
          channel,
          intentTier: tier,
          sampleSize: values.sampleSize,
          replyRate: Math.round((values.replies / values.sampleSize) * 100),
        }
      }),
    ).sort((a, b) => b.replyRate - a.replyRate),
  }
}

export async function buildMessagingPatternsForOrg(orgId: string) {
  const supabase = createServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - 90)

  const [
    { data: outboundRows },
    { data: inboundRows },
    { data: sequenceStepRows },
  ] = await Promise.all([
    supabase
      .from('activities')
      .select(`
        id,
        customer_id,
        type,
        body,
        created_at,
        customer_sequence_id,
        sequence_day,
        customer:customers(id, lead_intent_tier)
      `)
      .eq('user_id', orgId)
      .eq('direction', 'outbound')
      .in('type', ['sms', 'email', 'sms_followup', 'email_followup'])
      .gte('created_at', since.toISOString()),
    supabase
      .from('activities')
      .select('customer_id, created_at')
      .eq('user_id', orgId)
      .eq('direction', 'inbound')
      .gte('created_at', since.toISOString()),
    supabase
      .from('v_sequence_step_dropoff')
      .select('sequence_id, sequence_name, step_number, enrolled_count, silent_after_step_count, silence_rate')
      .eq('org_id', orgId),
  ])

  return buildMessagingPatternsFromRows({
    outboundRows: (outboundRows ?? []) as unknown as OutboundRow[],
    inboundRows: (inboundRows ?? []) as unknown as InboundRow[],
    sequenceStepRows: (sequenceStepRows ?? []) as unknown as SequenceStepRow[],
  })
}
