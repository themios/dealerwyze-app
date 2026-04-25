import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { renderMediaOnLambda, AwsRegion } from '@remotion/lambda-client'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'

// How many Lambda concurrent renders to allow at once.
// Each render uses ~11 Lambda invocations (framesPerLambda: 120).
// AWS Lambda concurrency raised to 1,000 — allow 5 concurrent renders.
const MAX_CONCURRENT_RENDERS = 5

// GET /api/cron/process-render-queue
// Dispatches queued video renders to Remotion Lambda.
// Runs every minute via Vercel cron (vercel.json).
export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('process-render-queue')

  try {
  const supabase = createServiceClient()

  // 1. Count how many renders are currently in progress
  const { count: renderingCount } = await supabase
    .from('video_renders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'rendering')

  const activeCount = renderingCount ?? 0

  if (activeCount >= MAX_CONCURRENT_RENDERS) {
    await finishCronRun(runId, 'success', 0)
    return NextResponse.json({
      dispatched: 0,
      skipped: true,
      reason: `${activeCount} render(s) already in progress (max: ${MAX_CONCURRENT_RENDERS})`,
    })
  }

  const slotsAvailable = MAX_CONCURRENT_RENDERS - activeCount

  // 2. Find the oldest queued renders (no lambda_render_id = never dispatched)
  const { data: queued } = await supabase
    .from('video_renders')
    .select('id, org_id, vehicle_id, props_snapshot, aspect_ratio, template_id')
    .eq('status', 'queued')
    .is('lambda_render_id', null)
    .order('created_at', { ascending: true })
    .limit(slotsAvailable)

  if (!queued || queued.length === 0) {
    await finishCronRun(runId, 'success', 0)
    return NextResponse.json({ dispatched: 0, reason: 'No queued renders' })
  }

  const lambdaFunctionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
  const awsRegion          = (process.env.AWS_REGION ?? 'us-east-1') as AwsRegion
  const serveUrl           = process.env.REMOTION_SERVE_URL

  if (!lambdaFunctionName || !serveUrl) {
    await finishCronRun(runId, 'error', undefined, 'Lambda not configured')
    return NextResponse.json({ error: 'Lambda not configured' }, { status: 500 })
  }

  let dispatched = 0
  const results: Array<{ id: string; status: 'dispatched' | 'failed'; error?: string }> = []

  for (const render of queued) {
    // Atomically claim this render: set to 'rendering' only if still 'queued'
    const { data: claimed } = await supabase
      .from('video_renders')
      .update({ status: 'rendering' })
      .eq('id', render.id)
      .eq('status', 'queued') // guard against race
      .select('id')
      .maybeSingle()

    if (!claimed) {
      // Another process claimed it first
      results.push({ id: render.id, status: 'failed', error: 'Already claimed' })
      continue
    }

    try {
      // Fetch the template composition_id
      const { data: template } = await supabase
        .from('video_templates')
        .select('composition_id')
        .eq('id', render.template_id)
        .single()

      const compositionId = template?.composition_id
      if (!compositionId) throw new Error('Template not found')

      const lambdaResult = await renderMediaOnLambda({
        region:       awsRegion,
        functionName: lambdaFunctionName,
        serveUrl,
        composition:  compositionId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputProps:   render.props_snapshot as any,
        codec:        'h264',
        imageFormat:  'jpeg',
        maxRetries:   1,
        framesPerLambda: 120,
        privacy:      'public',
        outName:      `videos/${render.org_id}/${render.vehicle_id}/${render.id}.mp4`,
        webhook: process.env.NEXT_PUBLIC_APP_URL
          ? {
              url:    `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/render-complete`,
              secret: process.env.RENDER_WEBHOOK_SECRET ?? '',
            }
          : undefined,
      })

      await supabase
        .from('video_renders')
        .update({ lambda_render_id: lambdaResult.renderId })
        .eq('id', render.id)

      dispatched++
      results.push({ id: render.id, status: 'dispatched' })
    } catch (err) {
      console.error(`[render-queue] Failed to dispatch ${render.id}:`, err)
      // Put it back to queued so it can be retried next cycle
      await supabase
        .from('video_renders')
        .update({ status: 'queued' })
        .eq('id', render.id)

      results.push({ id: render.id, status: 'failed', error: String(err) })
    }
  }

  await finishCronRun(runId, 'success', dispatched)
  return NextResponse.json({ dispatched, results })
  } catch (err) {
    await finishCronRun(runId, 'error', undefined, String(err))
    throw err
  }
}
