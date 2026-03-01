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
}

module.exports = withPWA(nextConfig)
