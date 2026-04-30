declare module 'next-pwa' {
  import type { NextConfig } from 'next'

  type NextPwaPlugin = (config?: NextConfig) => NextConfig

  export default function nextPwa(options?: Record<string, unknown>): NextPwaPlugin
}
