/**
 * Client-side fetch wrapper that throws ApiError on non-ok responses.
 * Use instead of bare fetch() in all client components that mutate data.
 *
 * @example
 *   try {
 *     await apiFetch('/api/settings/org', {
 *       method: 'PATCH',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify(form),
 *     })
 *     setSaved(true)
 *   } catch (err) {
 *     setError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
 *   }
 */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.'
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
    } catch {
      // response body is not JSON — use generic message
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}
