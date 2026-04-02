import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import FontSizeProvider from '@/components/providers/FontSizeProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DealerWyze',
  description:
    'DealerWyze — CRM for independent and used car dealers. Lead inbox, texting, inventory, BHPH, and receipts in one place.',
  manifest: '/manifest.json',
  other: {
    'facebook-domain-verification': 'szgt61sv00zpbbljhjit57coefp7a8',
  },
  icons: {
    icon: '/DealerWyseLogoWithName.png',
    shortcut: '/DealerWyseLogoWithName.png',
    apple: '/DealerWyseLogoWithName.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DealerWyze',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/DealerWyseLogoWithName.png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <FontSizeProvider>{children}</FontSizeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
