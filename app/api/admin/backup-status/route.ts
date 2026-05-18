import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createR2Client } from '@/lib/backup/r2Client'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function newest(objects: Array<{ Key?: string; LastModified?: Date; Size?: number }> | undefined) {
  const items = (objects ?? []).filter(o => o.Key && o.LastModified)
  items.sort((a, b) => (b.LastModified!.getTime() - a.LastModified!.getTime()))
  return items[0] ?? null
}

export async function GET() {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service role not required — this route reads R2 only.
  const r2 = createR2Client()
  const bucket = process.env.R2_BUCKET_NAME

  if (!r2 || !bucket) {
    return NextResponse.json({
      configured: false,
      error: 'R2 not configured',
      last_daily: null,
      last_weekly: null,
      last_monthly: null,
    })
  }

  try {
    const [daily, weekly, monthly] = await Promise.all([
      r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'daily/' })),
      r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'weekly/' })),
      r2.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'monthly/' })),
    ])

    return NextResponse.json({
      configured: true,
      last_daily: newest(daily.Contents),
      last_weekly: newest(weekly.Contents),
      last_monthly: newest(monthly.Contents),
    })
  } catch (e) {
    logger.error('admin/backup-status', e, { op: 'list' })
    return NextResponse.json({ configured: true, error: 'Failed to read R2' }, { status: 502 })
  }
}

