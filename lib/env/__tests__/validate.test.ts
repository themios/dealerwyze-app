import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { validateUpstashConfig } from '../validate'

describe('lib/env/validate', () => {
  // Save original env and console methods
  const originalEnv = process.env
  let consoleWarnSpy: any

  beforeEach(() => {
    // Reset NODE_ENV and Upstash vars before each test
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    }
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    consoleWarnSpy.mockRestore()
  })

  describe('production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production'
    })

    it('should not log anything when both Upstash vars present', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'AAuthToken123'

      validateUpstashConfig()

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should warn when both Upstash vars missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = undefined
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      validateUpstashConfig()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Rate limiting disabled: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not configured'
        )
      )
    })

    it('should throw when URL present but token missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      expect(() => validateUpstashConfig()).toThrow(/Partial Upstash configuration/)
      expect(() => validateUpstashConfig()).toThrow(/both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together/)
    })

    it('should throw when token present but URL missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = undefined
      process.env.UPSTASH_REDIS_REST_TOKEN = 'AAuthToken123'

      expect(() => validateUpstashConfig()).toThrow(/Partial Upstash configuration/)
    })
  })

  describe('development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development'
    })

    it('should not log anything when both Upstash vars missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = undefined
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      validateUpstashConfig()

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should warn when one Upstash var missing (URL present, token missing)', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      validateUpstashConfig()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Partial Upstash configuration')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiting disabled')
      )
    })

    it('should warn when one Upstash var missing (token present, URL missing)', () => {
      process.env.UPSTASH_REDIS_REST_URL = undefined
      process.env.UPSTASH_REDIS_REST_TOKEN = 'AAuthToken123'

      validateUpstashConfig()

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Partial Upstash configuration')
      )
    })

    it('should not throw on partial config in development', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = undefined

      expect(() => validateUpstashConfig()).not.toThrow()
    })
  })
})
