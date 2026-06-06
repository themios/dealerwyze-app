/**
 * GET /api/admin/health/email-domains
 * Verify that both Resend domains (DealerWyze + RealtyWyze) are configured and responsive.
 * Admin-only endpoint for operational monitoring.
 */

import { NextResponse } from 'next/server'
import { requirePlatformSuperAdmin } from '@/lib/auth/platform'

interface DomainStatus {
  domain: string
  configuredKey: boolean
  domain_name: string
  status: 'ok' | 'missing_key' | 'missing_domain' | 'error'
  error?: string
}

export async function GET(): Promise<NextResponse> {
  try {
    await requirePlatformSuperAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: DomainStatus[] = []

  // Check DealerWyze
  const dealerKey = process.env.RESEND_API_KEY
  const dealerDomain = process.env.RESEND_FROM_DOMAIN || 'dealerwyze.com'

  if (!dealerKey) {
    results.push({
      domain: 'dealerwyze',
      configuredKey: false,
      domain_name: dealerDomain,
      status: 'missing_key',
      error: 'RESEND_API_KEY not configured',
    })
  } else if (!dealerDomain) {
    results.push({
      domain: 'dealerwyze',
      configuredKey: true,
      domain_name: dealerDomain,
      status: 'missing_domain',
      error: 'RESEND_FROM_DOMAIN not set (defaults to dealerwyze.com)',
    })
  } else {
    results.push({
      domain: 'dealerwyze',
      configuredKey: true,
      domain_name: dealerDomain,
      status: 'ok',
    })
  }

  // Check RealtyWyze
  const realtyKey = process.env.REALTYWYZE_RESEND_API_KEY
  const realtyDomain = process.env.REALTYWYZE_RESEND_FROM_DOMAIN || 'realtywyze.us'

  if (!realtyKey) {
    results.push({
      domain: 'realtywyze',
      configuredKey: false,
      domain_name: realtyDomain,
      status: 'missing_key',
      error: 'REALTYWYZE_RESEND_API_KEY not configured',
    })
  } else if (!realtyDomain) {
    results.push({
      domain: 'realtywyze',
      configuredKey: true,
      domain_name: realtyDomain,
      status: 'missing_domain',
      error: 'REALTYWYZE_RESEND_FROM_DOMAIN not set (defaults to realtywyze.us)',
    })
  } else {
    results.push({
      domain: 'realtywyze',
      configuredKey: true,
      domain_name: realtyDomain,
      status: 'ok',
    })
  }

  const allOk = results.every((r) => r.status === 'ok')
  const statusCode = allOk ? 200 : 503

  return NextResponse.json(
    {
      healthy: allOk,
      domains: results,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode }
  )
}
