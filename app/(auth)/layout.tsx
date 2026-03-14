import type { Metadata } from 'next'

export const metadata: Metadata = {
  description:
    'Sign in or create your DealerWyze account. CRM for independent and used car dealers — lead inbox, texting, inventory, BHPH.',
  robots: { index: true, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
