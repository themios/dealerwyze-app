import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/service'
import { loadBookPageData, normalizeSlugParam } from '@/lib/showings/loadBookPageData'
import BookShowingForm from './BookShowingForm'

export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceClient()
  const data = await loadBookPageData(supabase, normalizeSlugParam(slug))
  if (!data) return { title: 'Not Found' }

  return {
    title: `Book a Showing — ${data.org.name} | RealtyWyze`,
    description: `Schedule a property showing with ${data.agent?.displayName ?? data.org.name}.`,
    robots: { index: true, follow: true },
  }
}

export default async function BookShowingPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()
  const data = await loadBookPageData(supabase, normalizeSlugParam(slug))

  if (!data) notFound()

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="border-b border-slate-200 bg-[#0D2B55] px-4 py-5 text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#F07018]">
              RealtyWyze
            </p>
            <h1 className="text-xl font-bold">Book a showing</h1>
          </div>
          <p className="hidden text-sm text-slate-300 sm:block">{data.org.name}</p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        <p className="mb-6 text-[15px] leading-relaxed text-slate-600">
          Request a private showing with{' '}
          <strong className="text-[#0D2B55]">
            {data.agent?.displayName ?? data.org.name}
          </strong>
          . Choose a property, pick your preferred times, and we will confirm by email.
        </p>

        <BookShowingForm
          orgId={data.org.id}
          orgName={data.org.name}
          agent={data.agent}
          listings={data.listings}
        />

        <p className="mt-8 text-center text-xs text-slate-400">
          Powered by{' '}
          <a
            href="https://realtywyze.us"
            className="text-[#F07018] hover:underline"
          >
            RealtyWyze
          </a>
        </p>
      </main>
    </div>
  )
}
