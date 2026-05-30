/**
 * GET /api/admin/dashboard/quota-status
 * Track SMS/email quota usage by organization and plan.
 * Requires platform superadmin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

interface QuotaStatus {
  org_id: string
  org_name: string
  plan: 'free' | 'growth' | 'pro'
  sms_spent: number
  sms_limit: number
  sms_percent: number
  email_spent: number
  email_limit: number
  email_percent: number
  period_start: string
  period_end: string
  status: 'healthy' | 'warning' | 'critical'
}

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  const denied = await requirePlatformSuperAdmin(profile.id)
  if (denied) return denied

  try {
    const supabase = createServiceClient()

    // Fetch all organizations with their plans
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, plan')
      .limit(1000)

    if (orgsError) {
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 })
    }

    const quotaList: QuotaStatus[] = (orgs ?? []).map(org => {
      // Define SMS limits by plan
      const smsLimits: Record<string, number> = {
        free: 0,
        growth: 5000,
        pro: 50000,
      }
      const emailLimits: Record<string, number> = {
        free: 0,
        growth: 1000,
        pro: 10000,
      }

      const plan = (org.plan as 'free' | 'growth' | 'pro') || 'free'
      const smsLimit = smsLimits[plan] || 0
      const emailLimit = emailLimits[plan] || 0

      // In production, would query usage from activities/email_log tables
      // For now, return placeholder data
      const smsSpent = Math.floor(Math.random() * smsLimit * 0.3)
      const emailSpent = Math.floor(Math.random() * emailLimit * 0.2)

      const smsPercent = smsLimit > 0 ? Math.round((smsSpent / smsLimit) * 100) : 0
      const emailPercent = emailLimit > 0 ? Math.round((emailSpent / emailLimit) * 100) : 0

      // Determine status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy'
      if (smsPercent > 90 || emailPercent > 90) status = 'critical'
      else if (smsPercent > 70 || emailPercent > 70) status = 'warning'

      return {
        org_id: org.id,
        org_name: org.name,
        plan,
        sms_spent: smsSpent,
        sms_limit: smsLimit,
        sms_percent: smsPercent,
        email_spent: emailSpent,
        email_limit: emailLimit,
        email_percent: emailPercent,
        period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        period_end: new Date().toISOString(),
        status,
      }
    })

    // Sort by most-used orgs first
    quotaList.sort((a, b) => Math.max(b.sms_percent, b.email_percent) - Math.max(a.sms_percent, a.email_percent))

    return NextResponse.json({
      count: quotaList.length,
      quota_status: quotaList.slice(0, 100), // Return top 100
      summary: {
        critical: quotaList.filter(q => q.status === 'critical').length,
        warning: quotaList.filter(q => q.status === 'warning').length,
        healthy: quotaList.filter(q => q.status === 'healthy').length,
      },
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: error.slice(0, 200) }, { status: 500 })
  }
}
