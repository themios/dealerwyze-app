import type { Metadata } from 'next'
import DealerOSLandingPage from '@/components/landing/DealerOSLandingPage'

export const metadata: Metadata = {
  title: 'Independent Dealer CRM That Runs Itself | DealerWyze',
  description:
    'DealerWyze automatically follows up with leads, sends BHPH reminders, posts listing videos, and handles post-sale retention - without manual effort. Built for independent used-car dealers.',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function IndependentDealerCrmLandingPage() {
  return <DealerOSLandingPage />
}
