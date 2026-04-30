import type { Metadata } from 'next'
import DealerOSLandingPage from '@/components/landing/DealerOSLandingPage'

export const metadata: Metadata = {
  title: 'DealerWyze - The Dealership Operating System for Independent Used-Car Dealers',
  description:
    'DealerWyze automatically answers leads, follows up with buyers, sends BHPH payment reminders, creates listing videos, and posts to social - all without you lifting a phone. Not just a CRM. A dealership operating system.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function DealerWyzeDealershipManagementLandingPage() {
  return <DealerOSLandingPage />
}
