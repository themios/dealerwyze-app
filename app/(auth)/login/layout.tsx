import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

export const metadata: Metadata = {
  title: 'Sign In | DealerWyze',
  description: 'Sign in to your DealerWyze account. One place for leads, inventory, and customer follow-up.',
  alternates: { canonical: `${baseUrl}/login` },
  robots: { index: true, follow: true },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
