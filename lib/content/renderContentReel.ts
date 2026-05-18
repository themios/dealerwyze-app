import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderMediaOnLambda, AwsRegion } from '@remotion/lambda-client'
import type { ContentReelProps } from '@/lib/remotion/types'
import { generateContentNarration } from './generateContentNarration'
import { getOrgBrandConfig, applyBrandConfig } from './brandConfig'
import { getRandomBrandPhoto } from './photoLibrary'

interface ContentRenderRequest {
  orgId: string
  props: ContentReelProps
  autoPost?: boolean
  platforms?: string[]
  triggeredByUser?: string
}

interface ContentRenderResult {
  renderId: string
  status: 'queued'
}

export async function renderContentReel(
  supabase: SupabaseClient,
  req: ContentRenderRequest,
): Promise<ContentRenderResult> {
  const { data: render, error } = await supabase
    .from('content_renders')
    .insert({
      org_id:              req.orgId,
      status:              'queued',
      props_snapshot:      req.props,
      auto_post:           req.autoPost ?? false,
      auto_post_platforms: req.platforms ?? [],
      triggered_by_user:   req.triggeredByUser ?? null,
    })
    .select('id')
    .single()

  if (error || !render) throw new Error('Failed to create content render record')

  const renderId = render.id

  const lambdaFunctionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
  const awsRegion          = (process.env.AWS_REGION ?? 'us-east-1') as AwsRegion
  const serveUrl           = process.env.REMOTION_SERVE_URL

  const backgroundWork = async () => {
    if (!lambdaFunctionName || !serveUrl) {
      await supabase
        .from('content_renders')
        .update({ status: 'failed', error_message: 'Lambda not configured' })
        .eq('id', renderId)
      return
    }

    try {
      // Merge org brand config (DB) into props — explicit props win over config defaults
      const brandConfig = await getOrgBrandConfig(supabase, req.orgId)
      let finalProps = applyBrandConfig(req.props, brandConfig) as ContentReelProps

      // Auto-pick a background photo from the org library if none provided
      if (!finalProps.backgroundImageUrl) {
        const photo = await getRandomBrandPhoto(supabase, req.orgId)
        if (photo) finalProps = { ...finalProps, backgroundImageUrl: photo }
      }
      if (!finalProps.narrationUrl) {
        const narration = await generateContentNarration(finalProps, renderId)
        if (narration) {
          // Convert narration duration to frames and pass so composition extends to fit audio
          const narrationFrames = Math.ceil((narration.durationMs / 1000) * 30)
          finalProps = { ...finalProps, narrationUrl: narration.url, totalDurationFrames: narrationFrames }
        }
      }

      const lambdaResult = await renderMediaOnLambda({
        region:       awsRegion,
        functionName: lambdaFunctionName,
        serveUrl,
        composition: 'ContentReel',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputProps:  finalProps as any,
        codec:       'h264',
        imageFormat: 'jpeg',
        maxRetries:  1,
        framesPerLambda: 120,
        privacy:    'public',
        outName:    `content/${req.orgId}/${renderId}.mp4`,
        webhook: process.env.NEXT_PUBLIC_APP_URL
          ? {
              url:    `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/render-complete`,
              secret: process.env.RENDER_WEBHOOK_SECRET ?? '',
            }
          : undefined,
      })

      await supabase
        .from('content_renders')
        .update({ status: 'rendering', lambda_render_id: lambdaResult.renderId })
        .eq('id', renderId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[renderContentReel] Lambda trigger failed:', msg)
      await supabase
        .from('content_renders')
        .update({ status: 'failed', error_message: msg.slice(0, 500) })
        .eq('id', renderId)
    }
  }

  void backgroundWork()

  return { renderId, status: 'queued' }
}
