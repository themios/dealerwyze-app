import { headers } from 'next/headers'
import type { Vertical } from '@/lib/vertical'

async function getLegalContent(vertical: Vertical): Promise<string> {
  const path = vertical === 'real_estate'
    ? 'public/realtywyze-terms.html'
    : 'public/terms.html'

  try {
    const { readFile } = await import('fs/promises')
    const content = await readFile(path, 'utf-8')
    return content
  } catch (e) {
    console.error(`Failed to load ${path}:`, e)
    return '<h1>Terms of Service</h1><p>Unable to load terms of service.</p>'
  }
}

export async function generateMetadata() {
  return {
    title: 'Terms of Service',
    robots: { index: true, follow: true },
  }
}

export default async function TermsPage() {
  const h = await headers()
  const vertical = (h.get('x-vertical') ?? 'dealer') as Vertical
  const content = await getLegalContent(vertical)

  return (
    <div className="prose max-w-none">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  )
}
