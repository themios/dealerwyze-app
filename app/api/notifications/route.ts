import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'

// Stub — in-app push notifications are delivered via web push (service worker).
// This endpoint exists to silence 404 noise from cached service workers or browser extensions
// that poll a REST notifications endpoint.
export async function GET() {
  await requireProfile()
  return NextResponse.json({ notifications: [] })
}
