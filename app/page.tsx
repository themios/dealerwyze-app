import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import LandingPage from '@/components/landing/LandingPage'
import RealtyWyzeLandingPage from '@/components/landing/RealtyWyzeLandingPage'
import type { Metadata } from 'next'
import type { Vertical } from '@/lib/vertical'

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers()
  const vertical = (h.get('x-vertical') ?? 'dealer') as Vertical

  if (vertical === 'real_estate') {
    return {
      title: 'RealtyWyze - CRM for Independent Real Estate Agents',
      description:
        'RealtyWyze puts every inquiry, listing, and client conversation in one place. Built for independent agents and small brokerages. Start free.',
      keywords: [
        'real estate CRM',
        'real estate agent software',
        'listing management',
        'real estate lead management',
        'agent CRM',
        'brokerage CRM',
      ],
      openGraph: {
        title: 'RealtyWyze - CRM for Independent Real Estate Agents',
        description:
          'One inbox for every inquiry. Listing management, AI voice, and client follow-up sequences built for independent agents.',
        url: 'https://realtywyze.us',
        siteName: 'RealtyWyze',
        type: 'website',
      },
      alternates: { canonical: 'https://realtywyze.us' },
      robots: { index: true, follow: true },
    }
  }

  return {
    title: 'DealerWyze - CRM for Independent & Used Car Dealers | Starting $150/mo',
    description:
      'DealerWyze is an all-in-one CRM built for independent and used car dealers. Text, email, and call leads from one inbox. Manage inventory, BHPH payments, and receipts — plus a public SEO-ready dealer website for your inventory. Starting at $150/mo - half the cost of VinSolutions or AutoRaptor.',
    keywords: [
      'used car dealer CRM',
      'independent dealer CRM',
      'AutoRaptor alternative',
      'VinSolutions alternative',
      'DealerCenter alternative',
      'dealership CRM software',
      'BHPH software',
      'buy here pay here CRM',
      'car dealer lead management',
      'auto dealer texting software',
      'dealership inventory management',
      'used car dealer software',
      'dealer inventory website',
      'car dealer SEO inventory',
      'used car dealer public website',
    ],
    openGraph: {
      title: 'DealerWyze - CRM for Independent & Used Car Dealers',
      description:
        'All-in-one CRM for used car dealers. Lead inbox, texting, inventory, public SEO website, BHPH, and receipts - starting at $150/mo.',
      url: 'https://dealerwyze.com',
      siteName: 'DealerWyze',
      type: 'website',
      images: [{ url: 'https://dealerwyze.com/og.png', width: 1200, height: 630, alt: 'DealerWyze - CRM for independent and used car dealers' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'DealerWyze - CRM for Independent & Used Car Dealers',
      description:
        'All-in-one CRM for used car dealers. Lead inbox, texting, inventory, public SEO website, BHPH, and receipts - starting at $150/mo.',
      images: ['https://dealerwyze.com/og.png'],
    },
    alternates: {
      canonical: 'https://dealerwyze.com',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
  }
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'DealerWyze',
      url: 'https://dealerwyze.com',
      logo: 'https://dealerwyze.com/DealerWyzeLogoWithName.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'DealerWyze',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      url: 'https://dealerwyze.com',
      description:
        'DealerWyze is a CRM platform built for independent and used car dealerships. Features include a unified lead inbox, two-way texting and email, inventory management, a public SEO-ready dealer website with vehicle detail pages, BHPH payment tracking, receipt scanning, and AI-powered Dealer Brief.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '0',
          priceCurrency: 'USD',
          description:
            '1 user, 50 customers, 200 texts/mo, 200 emails/mo, basic inventory and lead management.',
        },
        {
          '@type': 'Offer',
          name: 'Growth',
          price: '150',
          priceCurrency: 'USD',
          description:
            '3 users, 500 customers, 1,000 texts/mo, 1,000 emails/mo, 30 faxes/mo, 5 AI voice leads/day, BHPH, sequences, want list.',
        },
        {
          '@type': 'Offer',
          name: 'Pro',
          price: '350',
          priceCurrency: 'USD',
          description:
            'Unlimited users, 2,000 customers, 3,000 texts/mo, 3,000 emails/mo, 100 faxes/mo, 20 AI voice leads/day, all Growth features.',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How does DealerWyze compare to VinSolutions?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'VinSolutions targets large franchise dealers and typically costs $500-$1,500/mo. DealerWyze is built specifically for independent and used car dealers, starting at $150/mo. It includes two-way texting, BHPH payment tracking, receipt scanning, and AI voice leads - features VinSolutions does not offer for small lots.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does DealerWyze compare to AutoRaptor?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'AutoRaptor is a lead management tool primarily for independent dealers. DealerWyze covers lead management plus inventory, BHPH, expense tracking, receipt OCR, AI voice answering, and an AI-powered daily Dealer Brief. Pricing starts at $150/mo vs AutoRaptor\'s $400+/mo.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does DealerWyze compare to DealerCenter?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'DealerCenter is a full dealer management system (DMS) with F&I and accounting modules, priced at $300-$800+/mo. DealerWyze focuses on customer communication, lead follow-up, and daily operations - a lighter, faster tool that complements or replaces DealerCenter for smaller lots that do not need a full DMS.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does DealerWyze support BHPH dealers?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. DealerWyze includes BHPH payment ledger tracking, overdue payment alerts, and automated payment reminder texts - designed for buy-here-pay-here and in-house financing dealers.',
          },
        },
        {
          '@type': 'Question',
          name: 'How much does DealerWyze cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'DealerWyze has three plans: Starter (free, 1 user), Growth ($150/mo, 3 users, 1,000 texts), and Pro ($350/mo, unlimited users, 3,000 texts). All plans include inventory management, lead inbox, two-way texting, and email.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does DealerWyze include texting and calling?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. DealerWyze includes two-way texting (SMS and MMS), email, and AI-powered voice leads that answer inbound calls, qualify callers, and create follow-up tasks automatically.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does DealerWyze include a public website for inventory?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Every plan includes a branded public inventory website on a DealerWyze URL with SEO-friendly vehicle listings, detail pages, structured data, and contact forms. Upload your logo and dealer info in Settings. It is part of the 30-day trial and remains available on the free plan.',
          },
        },
      ],
    },
  ],
}

export default async function RootPage() {
  const h = await headers()
  const vertical = (h.get('x-vertical') ?? 'dealer') as Vertical

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/today')

  if (vertical === 'real_estate') {
    return <RealtyWyzeLandingPage />
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  )
}
