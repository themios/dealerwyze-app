import type { Metadata } from 'next'
import DealerOSLandingPage from '@/components/landing/DealerOSLandingPage'

export const metadata: Metadata = {
  title: 'DealerWyze - The Dealership Operating System',
  description:
    'DealerWyze automatically answers leads, follows up with buyers, sends BHPH reminders, creates listing videos, and handles post-sale retention. Not just a CRM - a full dealership operating system for independent used-car dealers.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function DealerOSPage() {
  return <DealerOSLandingPage />
}
