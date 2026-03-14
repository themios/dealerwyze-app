import type { Metadata } from 'next'

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'

export const metadata: Metadata = {
  title: 'Create Account | DealerWyze',
  description:
    'Start your free DealerWyze account. CRM for independent and used car dealers — no credit card required.',
  alternates: { canonical: `${baseUrl}/signup` },
  robots: { index: true, follow: true },
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
