import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import type { Metadata } from 'next'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('name, website_tagline')
    .eq('slug', slug)
    .eq('public_inventory_enabled', true)
    .single()

  if (!org) return {}

  return {
    title: `${org.name} - Vehicle Inventory`,
    description: org.website_tagline ?? `Browse vehicles at ${org.name}`,
  }
}

export default async function DealerPublicLayout({ children, params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, website_tagline, public_inventory_enabled, slug')
    .eq('slug', slug)
    .single()

  if (!org || !org.public_inventory_enabled) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Public dealer header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{org.name}</h1>
            {org.website_tagline && (
              <p className="text-sm text-gray-500 mt-0.5">{org.website_tagline}</p>
            )}
          </div>
          <div className="text-sm text-gray-400">
            Powered by DealerWyze
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-gray-200 mt-12 py-6 text-center text-sm text-gray-400">
        <p>
          &copy; {new Date().getFullYear()} {org.name}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
