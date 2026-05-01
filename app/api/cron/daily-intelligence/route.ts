import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { runDailyIntelligenceJob } from '@/lib/cron/runDailyIntelligence'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const result = await runDailyIntelligenceJob({
    generateBriefings: process.env.DAILY_INTELLIGENCE_GENERATE_BRIEF === 'true',
  })
  return NextResponse.json(result)
}
