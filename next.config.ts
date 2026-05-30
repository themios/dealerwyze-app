import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy-Report-Only',
    value: "default-src 'self' https:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval' data:; style-src 'self' https: 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self' https: wss:; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;",
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
  turbopack: {
    root: __dirname,
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

module.exports = withSentryConfig(nextConfig, sentryConfig)
