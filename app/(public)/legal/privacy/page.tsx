import { headers } from 'next/headers'
import type { Vertical } from '@/lib/vertical'

async function getLegalContent(vertical: Vertical): Promise<string> {
  const path = vertical === 'real_estate'
    ? 'public/realtywyze-privacy.html'
    : 'public/privacy.html'

  try {
    const { readFile } = await import('fs/promises')
    const content = await readFile(path, 'utf-8')
    return content
  } catch (e) {
    console.error(`Failed to load ${path}:`, e)
    return '<h1>Privacy Policy</h1><p>Unable to load privacy policy.</p>'
  }
}

export async function generateMetadata() {
  return {
    title: 'Privacy Policy',
    robots: { index: true, follow: true },
  }
}

export default async function PrivacyPage() {
  const h = await headers()
  const vertical = (h.get('x-vertical') ?? 'dealer') as Vertical
  const content = await getLegalContent(vertical)

  return (
    <div className="prose max-w-none">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  )
}
