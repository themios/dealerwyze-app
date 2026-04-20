import { NextResponse } from 'next/server'

// Required by Meta for Facebook/Instagram OAuth apps.
// Returns instructions for users to request data deletion.
export async function GET() {
  return NextResponse.json({
    url: 'https://dealerwyze.com/privacy.html',
    instructions: 'To request deletion of your data, email privacy@dealerwyze.com or visit our privacy policy page.',
  })
}

export async function POST() {
  // Meta may POST a signed_request here for user data deletion.
  // For now, return a confirmation URL pointing to our privacy policy.
  return NextResponse.json({
    url: 'https://dealerwyze.com/privacy.html',
    confirmation_code: 'dealerwyze-data-deletion',
  })
}
