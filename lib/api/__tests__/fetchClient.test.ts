import { vi, describe, it, expect, beforeEach } from 'vitest'
import { apiFetch, ApiError } from '../fetchClient'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on 200', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123' }),
    })
    const result = await apiFetch<{ id: string }>('/api/test')
    expect(result).toEqual({ id: '123' })
  })

  it('throws ApiError with server error message on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Validation failed' }),
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Validation failed')
  })

  it('throws ApiError with correct status code', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    })
    try {
      await apiFetch('/api/test')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(500)
    }
  })

  it('falls back to generic message when error field is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Something went wrong. Please try again.')
  })

  it('falls back to generic message when response body is not JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })
    await expect(apiFetch('/api/test')).rejects.toThrow('Something went wrong. Please try again.')
  })

  it('passes options through to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    global.fetch = mockFetch
    await apiFetch('/api/test', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Tim' }),
    })
    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'PATCH',
    }))
  })
})
