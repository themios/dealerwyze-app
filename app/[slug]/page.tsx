import { redirect } from 'next/navigation'

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
  redirect(`/${normalizeSlugParam(slug)}/inventory`)
}
