/**
 * GET   /api/admin/orgs/[id]/limits  — view current limits for a dealer org
 * PATCH /api/admin/orgs/[id]/limits  — adjust per-org limits (superadmin only)
 *
 * Adjustable limits:
 *   voice_minutes_cap      (org_settings) — default 42000 sec = 700 min
 *   sms_quota              (organizations) — default 1000 msg/mo
 *   mms_cap override       (organizations via metadata) — default 200 MMS/mo
 *   voice_overage_enabled  (organizations) — allow voice above cap at $0.12/min
 *   sms_overage_enabled_v2 (organizations) — allow SMS above quota at $0.08/msg
 *   voice_enabled          (org_settings) — manual kill switch
 *   scan_image_monthly_cap (organizations) — default per-plan
 *   scan_pdf_monthly_cap   (organizations) — default per-plan
 *
 * All changes are logged to admin_audit_log.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase
      .from('organizations')
      .select(`
        id, name, slug, subscription_status, plan_tier,
        sms_quota, voice_overage_enabled, sms_overage_enabled_v2,
        voice_overage_minutes, sms_overage_count, mms_overage_count,
        monthly_message_count, monthly_mms_count,
        scan_image_monthly_cap, scan_pdf_monthly_cap,
        annual_billing, affiliate_code, referred_by_org_id
      `)
      .eq('id', id)
      .single(),
    supabase
      .from('org_settings')
      .select(`
        voice_enabled, voice_minutes_cap, voice_minutes_month,
        voice_overage_notified_at
      `)
      .eq('org_id', id)
      .maybeSingle(),
  ])

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  return NextResponse.json({
    org_id: id,
    name: org.name,
    plan_tier: org.plan_tier,
    limits: {
      // Voice
      voice_enabled:         settings?.voice_enabled ?? true,
      voice_minutes_cap:     settings?.voice_minutes_cap ?? 42000,      // seconds
      voice_minutes_cap_min: Math.round((settings?.voice_minutes_cap ?? 42000) / 60), // minutes
      voice_minutes_used:    settings?.voice_minutes_month ?? 0,
      voice_minutes_used_min: Math.round((settings?.voice_minutes_month ?? 0) / 60),
      voice_overage_enabled: org.voice_overage_enabled ?? false,
      voice_overage_minutes: org.voice_overage_minutes ?? 0,
      // SMS
      sms_quota:             org.sms_quota ?? 1000,
      sms_used:              org.monthly_message_count ?? 0,
      sms_overage_enabled:   org.sms_overage_enabled_v2 ?? false,
      sms_overage_count:     org.sms_overage_count ?? 0,
      // MMS
      mms_used:              org.monthly_mms_count ?? 0,
      mms_overage_count:     org.mms_overage_count ?? 0,
      // Scans
      scan_image_monthly_cap: org.scan_image_monthly_cap,
      scan_pdf_monthly_cap:   org.scan_pdf_monthly_cap,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  const { id } = await params
  const body = await req.json()
  const {
    voice_minutes_cap_min,  // convenience: pass minutes, stored as seconds
    voice_minutes_cap,      // raw seconds (overrides voice_minutes_cap_min if both)
    voice_enabled,
    voice_overage_enabled,
    sms_quota,
    sms_overage_enabled,
    scan_image_monthly_cap,
    scan_pdf_monthly_cap,
    reason,                 // required: audit log note
  } = body

  if (!reason || String(reason).trim().length < 3) {
    return NextResponse.json({ error: 'reason is required for audit log' }, { status: 400 })
  }

  const supabase   = createServiceClient()
  const orgUpdates: Record<string, unknown> = {}
  const settUpdates: Record<string, unknown> = {}
  const auditChanges: Record<string, unknown> = {}

  // Voice cap (minutes → seconds)
  if (voice_minutes_cap_min !== undefined || voice_minutes_cap !== undefined) {
    const secs = voice_minutes_cap !== undefined
      ? Number(voice_minutes_cap)
      : Math.round(Number(voice_minutes_cap_min) * 60)
    if (isNaN(secs) || secs < 0) {
      return NextResponse.json({ error: 'Invalid voice_minutes_cap value' }, { status: 400 })
    }
    settUpdates.voice_minutes_cap = secs
    auditChanges.voice_minutes_cap_min = Math.round(secs / 60)
  }

  if (typeof voice_enabled === 'boolean') {
    settUpdates.voice_enabled = voice_enabled
    auditChanges.voice_enabled = voice_enabled
  }

  if (typeof voice_overage_enabled === 'boolean') {
    orgUpdates.voice_overage_enabled = voice_overage_enabled
    auditChanges.voice_overage_enabled = voice_overage_enabled
  }

  if (sms_quota !== undefined) {
    const q = Number(sms_quota)
    if (isNaN(q) || q < 0) {
      return NextResponse.json({ error: 'Invalid sms_quota value' }, { status: 400 })
    }
    orgUpdates.sms_quota = q
    auditChanges.sms_quota = q
  }

  if (typeof sms_overage_enabled === 'boolean') {
    orgUpdates.sms_overage_enabled_v2 = sms_overage_enabled
    auditChanges.sms_overage_enabled = sms_overage_enabled
  }

  if (scan_image_monthly_cap !== undefined) {
    orgUpdates.scan_image_monthly_cap = Number(scan_image_monthly_cap)
    auditChanges.scan_image_monthly_cap = Number(scan_image_monthly_cap)
  }
  if (scan_pdf_monthly_cap !== undefined) {
    orgUpdates.scan_pdf_monthly_cap = Number(scan_pdf_monthly_cap)
    auditChanges.scan_pdf_monthly_cap = Number(scan_pdf_monthly_cap)
  }

  if (Object.keys(auditChanges).length === 0) {
    return NextResponse.json({ error: 'No valid limit fields provided' }, { status: 400 })
  }

  // Apply updates (Supabase builders are thenable; wrap so ops is Promise<unknown>[])
  const ops: Promise<unknown>[] = []

  if (Object.keys(settUpdates).length > 0) {
    ops.push(
      Promise.resolve(supabase.from('org_settings').update(settUpdates).eq('org_id', id)),
    )
  }
  if (Object.keys(orgUpdates).length > 0) {
    ops.push(
      Promise.resolve(supabase.from('organizations').update(orgUpdates).eq('id', id)),
    )
  }

  // Audit log
  ops.push(
    Promise.resolve(
      supabase.from('admin_audit_log').insert({
        performed_by: profile.id,
        action:       'adjust_org_limits',
        target_org_id: id,
        metadata:     { changes: auditChanges, reason: reason.trim() },
      }),
    ),
  )

  await Promise.all(ops)

  return NextResponse.json({
    ok: true,
    updated: auditChanges,
    message: `Limits updated for org ${id}`,
  })
}
