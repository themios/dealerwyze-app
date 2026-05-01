import crypto from 'crypto'

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const sortedParams = Object.keys(params).sort().reduce((s, k) => s + k + params[k], '')
  const expected = crypto
    .createHmac('sha1', authToken)
    .update(url + sortedParams)
    .digest('base64')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

export function getTwilioWebhookBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
}
