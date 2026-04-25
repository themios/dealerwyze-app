import type { NextConfig } from 'next'
import path from 'path'
import { withSentryConfig } from '@sentry/nextjs'

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
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
  webpack: (config: any) => {
    config.resolve = config.resolve ?? {}
    const existing: string[] = config.resolve.modules ?? ['node_modules']
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
  ],
}

const sentryConfig = {
  // Suppresses Sentry CLI output during build
  silent: !process.env.CI,
  // Automatically instrument Next.js API routes and pages
  widenClientFileUpload: true,
  // Don't create a release if DSN is missing (dev without Sentry configured)
  dryRun: !process.env.NEXT_PUBLIC_SENTRY_DSN,
}

module.exports = withSentryConfig(withPWA(nextConfig), sentryConfig)
