import type { NextConfig } from 'next'
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  // next-pwa requires webpack; disable turbopack default in Next 16
  turbopack: {},
  // Keep AI SDKs server-only so they are never bundled for the client (avoids "apiKey nor authenticator" in browser)
  serverExternalPackages: ['groq-sdk', '@anthropic-ai/sdk'],
}

module.exports = withPWA(nextConfig)
