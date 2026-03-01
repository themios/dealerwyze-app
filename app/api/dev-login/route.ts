import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// TEMPORARY: delete this file once you've confirmed auth works end-to-end
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')

  if (secret !== process.env.DEV_LOGIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = process.env.DEV_LOGIN_EMAIL
  if (!email) {
    return NextResponse.json({ error: 'DEV_LOGIN_EMAIL not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${request.nextUrl.origin}/auth/callback`,
    },
  })

  if (error || !data.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'No link generated' }, { status: 500 })
  }

  return NextResponse.redirect(data.properties.action_link)
}
