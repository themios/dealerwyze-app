import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Inter, Barlow_Semi_Condensed, Archivo, Lora, Oswald } from 'next/font/google'
import { getVerticalConfig } from '@/lib/vertical'
import type { Vertical } from '@/lib/vertical'
import { ThemeProvider } from 'next-themes'
import FontSizeProvider from '@/components/providers/FontSizeProvider'
import AnalyticsProvider from '@/components/providers/AnalyticsProvider'
import { PostHogProvider } from '@/lib/posthog/provider'
import { Toaster } from 'sonner'
import GoogleAdsGtag from '@/components/analytics/GoogleAdsGtag'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })
const barlow = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
})
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
})
const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-classic',
})
const oswald = Oswald({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bold-style',
})

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const vertical = (headersList.get('x-vertical') ?? 'dealer') as Vertical
  const config = getVerticalConfig(vertical)

  return {
    title: config.brandName,
    description: `${config.brandName} - ${config.tagline}`,
    manifest: '/manifest.json',
    other: {
      'facebook-domain-verification': 'szgt61sv00zpbbljhjit57coefp7a8',
    },
    icons: vertical === 'real_estate'
      ? {
          icon:    '/rw-icon.png',
          shortcut:'/rw-icon.png',
          apple:   '/rw-icon.png',
        }
      : {
          icon:    '/DealerWyseLogoWithName.png',
          shortcut:'/DealerWyseLogoWithName.png',
          apple:   '/DealerWyseLogoWithName.png',
        },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: config.brandName,
    },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head />
      <body className={`${inter.className} ${barlow.variable} ${archivo.variable} ${lora.variable} ${oswald.variable}`} suppressHydrationWarning>
        <GoogleAdsGtag />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PostHogProvider>
            <AnalyticsProvider />
            <FontSizeProvider>
              <NextIntlClientProvider>
                {children}
                <Toaster richColors closeButton position="top-center" />
              </NextIntlClientProvider>
            </FontSizeProvider>
          </PostHogProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
