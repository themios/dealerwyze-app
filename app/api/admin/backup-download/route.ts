import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { canAccessAdminArea } from '@/lib/auth/platform'
import { createR2Client } from '@/lib/backup/r2Client'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ALLOWED_PREFIXES = ['daily/', 'weekly/', 'monthly/'] as const

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!(await canAccessAdminArea(profile.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  if (!ALLOWED_PREFIXES.some(p => key.startsWith(p))) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }
  if (key.includes('..') || key.includes('//')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const r2 = createR2Client()
  const bucket = process.env.R2_BUCKET_NAME
  if (!r2 || !bucket) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 })
  }

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 900 },
  )

  return NextResponse.json({ url, expires_in_seconds: 900 })
}

