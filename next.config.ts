import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'
import nextPwa from 'next-pwa'
import type { Configuration } from 'webpack'

const withPWA = nextPwa({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },

  // Allow HMR WebSocket connections from the local network IP (for mobile/tablet testing).
  // Safe for dev only — next-pwa disables in production anyway.
  allowedDevOrigins: ['192.168.0.100'],

  // Anchor Turbopack to this project directory — prevents it from traversing up to stray
  // package-lock.json files at /home/tim and /home/tim/Applications levels.
  // Empty turbopack object also silences the "webpack config without turbopack config" error
  // that next-pwa triggers (PWA is disabled in dev anyway).
  turbopack: {
    root: __dirname,
  },
  // next-pwa runs webpack alongside Turbopack. Webpack resolves CSS from ApolloCRM/
  // context (a parent dir), so it never finds tailwindcss/tw-animate-css/shadcn in
  // apollo-crm/node_modules. This prepends the correct node_modules to fix it.
  webpack: (config: Configuration) => {
    config.resolve = config.resolve ?? {}
    const existing = Array.isArray(config.resolve.modules) ? config.resolve.modules : ['node_modules']
    config.resolve.modules = [path.join(__dirname, 'node_modules'), ...existing]
    return config
  },
  // Keep AI SDKs server-only so they are never bundled for the client (avoids "apiKey nor authenticator" in browser)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'arsdoonmqlilrqiqbbzh.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  serverExternalPackages: [
    'groq-sdk',
    '@anthropic-ai/sdk',
    '@remotion/lambda',
    '@remotion/lambda-client',
    '@remotion/renderer',
    '@remotion/bundler',
    '@remotion/cli',
    '@aws-sdk/client-s3',
    'esbuild',
    'twilio',
  ],
}

const sentryConfig = {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  dryRun: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableServerWebpackPlugin: false,
  disableClientWebpackPlugin: false,
}

module.exports = withSentryConfig(withPWA(nextConfig), sentryConfig)
