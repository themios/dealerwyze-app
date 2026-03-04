// DEPRECATED 2026-03-04: Facebook feed removed per plan change.
// Inventory is now managed via dealer website (www.apolloauto-em.com).
// Route kept as stub to return 410 Gone so existing bookmarked URLs fail gracefully.
export const runtime = 'nodejs'

export function GET() {
  return new Response(
    'This inventory feed endpoint has been discontinued. Inventory is managed via the dealer website.',
    { status: 410 }
  )
}
