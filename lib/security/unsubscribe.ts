import crypto from 'crypto'

export function requireUnsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET?.trim()
  if (!secret) {
    throw new Error('UNSUBSCRIBE_SECRET is required for unsubscribe links.')
  }
  return secret
}

export function buildUnsubscribeToken(customerId: string): string {
  return crypto.createHmac('sha256', requireUnsubscribeSecret()).update(customerId).digest('hex')
}
