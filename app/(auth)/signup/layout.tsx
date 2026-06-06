import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
const isRE =
  process.env.VERCEL_URL?.includes('realtywyze') ||
  process.env.NEXT_PUBLIC_APP_URL?.includes('realtywyze') ||
  false

const brandName = isRE ? 'RealtyWyze' : 'DealerWyze'
const description = isRE
  ? 'Start your free RealtyWyze account. CRM for real estate brokers and agents — no credit card required.'
  : 'Start your free DealerWyze account. CRM for independent and used car dealers — no credit card required.'

export const metadata: Metadata = {
  title: `Create Account | ${brandName}`,
  description,
  alternates: { canonical: `${baseUrl}/signup` },
  robots: { index: true, follow: true },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
