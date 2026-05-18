import 'server-only'
import crypto from 'crypto'

/**
 * Validates MCP bearer token for the content API.
 * Returns the configured org_id when valid, null otherwise.
 *
 * Set CONTENT_MCP_TOKEN and CONTENT_MCP_ORG_ID in .env to enable.
 */
export function validateMcpToken(authHeader: string | null): string | null {
  const token   = process.env.CONTENT_MCP_TOKEN
  const orgId   = process.env.CONTENT_MCP_ORG_ID
  if (!token || !orgId || !authHeader) return null

  const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (provided.length !== token.length) return null

  const equal = crypto.timingSafeEqual(
    Buffer.from(provided, 'utf8'),
    Buffer.from(token,    'utf8'),
  )
  return equal ? orgId : null
}
