import { notFound, redirect } from 'next/navigation'
import { isReservedPublicSlug } from '@/lib/dealer-public/reservedSlugs'

interface Props {
  params: Promise<{ slug: string }>
}

function normalizeSlugParam(s: string) {
  try {
    return decodeURIComponent(s).trim()
  } catch {
    return s.trim()
  }
}

/** Public dealer landing: send visitors to inventory (layout still enforces org + public flag). */
export default async function DealerPublicIndexPage({ params }: Props) {
  const { slug } = await params
  const normalized = normalizeSlugParam(slug)
  if (isReservedPublicSlug(normalized)) notFound()
  redirect(`/${normalized}/inventory`)
}
