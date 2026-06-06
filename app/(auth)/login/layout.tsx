import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
const isRE =
  process.env.VERCEL_URL?.includes('realtywyze') ||
  process.env.NEXT_PUBLIC_APP_URL?.includes('realtywyze') ||
  false

const brandName = isRE ? 'RealtyWyze' : 'DealerWyze'
const description = isRE
  ? 'Sign in to your RealtyWyze account. One place for prospects, listings, and client follow-up.'
  : 'Sign in to your DealerWyze account. One place for leads, inventory, and customer follow-up.'

export const metadata: Metadata = {
  title: `Sign In | ${brandName}`,
  description,
  alternates: { canonical: `${baseUrl}/login` },
  robots: { index: true, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
