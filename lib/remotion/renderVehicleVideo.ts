import { createServiceClient } from '@/lib/supabase/service'
import { VehicleVideoProps, OrgVideoSettings, VideoTemplate } from './types'
import { checkRenderQuota } from './quotaCheck'
import { selectPhotos, selectTemplate, selectVoice } from './selectDefaults'
import { generateVehicleNarrationWithVoice } from './generateNarration'
import { renderMediaOnLambda, AwsRegion } from '@remotion/lambda-client'

interface RenderRequest {
  orgId: string
  vehicleId: string
  triggeredByUser?: string
  templateId?: string
  photoUrls?: string[]
  voice?: string
  autoPost?: boolean
  platforms?: string[]
}

interface RenderResult {
  renderId: string
  status: 'queued' | 'rendering'
}

export async function renderVehicleVideo(req: RenderRequest): Promise<RenderResult> {
  const supabase = createServiceClient()

  // 1. Check quota (throws QuotaError if over limit)
  await checkRenderQuota(req.orgId)

  // 2. Fetch vehicle
  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', req.vehicleId)
    .single()

  if (vehicleError || !vehicle) {
    throw new Error('Vehicle not found')
  }

  // 2b. Fetch vehicle photos ordered by position (use existing Supabase Storage URLs directly)
  const { data: vehiclePhotos } = await supabase
    .from('vehicle_photos')
    .select('url')
    .eq('vehicle_id', req.vehicleId)
    .order('position', { ascending: true })
    .limit(8)

  // Build photo list: vehicle_photos table first, fall back to photo_url
  const availablePhotos: string[] = vehiclePhotos?.map(p => p.url).filter(Boolean) ?? []
  if (availablePhotos.length === 0 && vehicle.photo_url) {
    availablePhotos.push(vehicle.photo_url)
  }

  // 3. Fetch org_settings for dealer branding
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('dealer_name, phone, city, state, website')
    .eq('org_id', req.orgId)
    .maybeSingle()

  // 4. Fetch org name as fallback
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', req.orgId)
    .single()

  // 5. Fetch org_video_settings
  const { data: videoSettings } = await supabase
    .from('org_video_settings')
    .select('*')
    .eq('org_id', req.orgId)
    .maybeSingle()

  // 6. Fetch templates
  const { data: templates } = await supabase
    .from('video_templates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  // 7. Select defaults
  const selectedPhotos = selectPhotos(
    { photos: availablePhotos },
    req.photoUrls,
  )
  const selectedTemplate = selectTemplate(
    { price: vehicle.price, make: vehicle.make, model: vehicle.model },
    videoSettings as OrgVideoSettings | null,
    (templates as VideoTemplate[]) ?? [],
    req.templateId,
  )
  const selectedVoice = selectVoice(videoSettings as OrgVideoSettings | null, req.voice)

  if (!selectedTemplate) {
    throw new Error('No video template available')
  }

  // 8. Build VehicleVideoProps
  const dealerName  = orgSettings?.dealer_name ?? org?.name ?? 'Dealer'
  const dealerPhone = orgSettings?.phone ?? ''
  const dealerCity  = orgSettings?.city ?? ''
  const dealerState = orgSettings?.state ?? ''

  const propsSnapshot: VehicleVideoProps = {
    dealerName,
    dealerCity,
    dealerState,
    dealerPhone,
    dealerWebsite: orgSettings?.website ?? undefined,
    year:      vehicle.year    ?? new Date().getFullYear(),
    make:      vehicle.make    ?? '',
    model:     vehicle.model   ?? '',
    trim:      vehicle.trim    ?? undefined,
    price:     vehicle.price   ?? 0,
    mileage:   vehicle.mileage ?? 0,
    color:     vehicle.color    ?? undefined,
    interior:  vehicle.interior ?? undefined,
    vin:       vehicle.vin      ?? undefined,
    engine:    vehicle.engine   ?? undefined,
    mpgCity:   vehicle.mpg_city ?? undefined,
    mpgHwy:    vehicle.mpg_hwy  ?? undefined,
    isSalvage: (vehicle as Record<string, unknown>).title_status === 'salvage',
    photos:    selectedPhotos,
    features:  Array.isArray((vehicle as Record<string, unknown>).features)
      ? ((vehicle as Record<string, unknown>).features as string[]).filter(Boolean).slice(0, 6)
      : [],
    showPrice:     videoSettings?.include_price     ?? true,
    showPhone:     videoSettings?.include_phone     ?? true,
    showWatermark: videoSettings?.watermark_enabled ?? true,
  }

  // 9. Create video_renders row first so it always exists
  const { data: render, error: renderError } = await supabase
    .from('video_renders')
    .insert({
      org_id:               req.orgId,
      vehicle_id:           req.vehicleId,
      template_id:          selectedTemplate.id,
      status:               'queued',
      aspect_ratio:         selectedTemplate.aspect_ratio,
      narration_url:        null,
      triggered_by:         req.triggeredByUser ? 'manual' : 'auto',
      triggered_by_user:    req.triggeredByUser ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props_snapshot:       propsSnapshot as any,
      selected_photo_urls:  selectedPhotos,
      voice_name:           selectedVoice,
      auto_post:            req.autoPost ?? false,
      auto_post_platforms:  req.platforms ?? [],
    })
    .select('id')
    .single()

  if (renderError || !render) {
    throw new Error('Failed to create render record')
  }

  const renderId = render.id

  // 10. Generate narration (after DB row created so failures don't block record creation)
  let narrationUrl = ''
  try {
    narrationUrl = await generateVehicleNarrationWithVoice(
      req.orgId,
      req.vehicleId,
      propsSnapshot,
      selectedVoice,
    )
  } catch (err) {
    console.error('[renderVehicleVideo] Narration generation failed:', err)
  }

  if (narrationUrl) {
    propsSnapshot.narrationUrl = narrationUrl
    await supabase
      .from('video_renders')
      .update({ narration_url: narrationUrl, props_snapshot: propsSnapshot as any })
      .eq('id', renderId)
  }

  // 11. Trigger Remotion Lambda (if configured)
  const lambdaFunctionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME
  const awsRegion          = (process.env.AWS_REGION ?? 'us-east-1') as AwsRegion
  const serveUrl           = process.env.REMOTION_SERVE_URL

  if (lambdaFunctionName && serveUrl) {
    try {
      const lambdaResult = await renderMediaOnLambda({
        region: awsRegion,
        functionName:  lambdaFunctionName,
        serveUrl,
        composition:   selectedTemplate.composition_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputProps:    propsSnapshot as any,
        codec:         'h264',
        imageFormat:   'jpeg',
        maxRetries:    1,
        framesPerLambda: 120, // ~11 render workers + 1 orchestrator (Lambda limit raised to 1000)
        privacy:       'public',
        outName:       `videos/${req.orgId}/${req.vehicleId}/${renderId}.mp4`,
        webhook: process.env.NEXT_PUBLIC_APP_URL
          ? {
              url:    `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/render-complete`,
              secret: process.env.RENDER_WEBHOOK_SECRET ?? '',
            }
          : undefined,
      })

      // Update with Lambda render ID
      await supabase
        .from('video_renders')
        .update({ status: 'rendering', lambda_render_id: lambdaResult.renderId })
        .eq('id', renderId)

      return { renderId, status: 'rendering' }
    } catch (err) {
      console.error('[renderVehicleVideo] Lambda trigger failed:', err)
      // Fall through to queued state — will need manual retry
    }
  }

  return { renderId, status: 'queued' }
}
