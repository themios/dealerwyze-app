const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'a', 'img'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:   new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
}

const TRUSTED_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]

const TRUSTED_ALLOWED_ATTR: Record<string, string[]> = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
}

// Lazy-loaded only when trustHtml=true to avoid JSDOM startup cost in serverless.
let _domPurify: { sanitize: (input: string, options: unknown) => string } | null = null
async function getDomPurify() {
  if (!_domPurify) {
    const mod = await import('isomorphic-dompurify')
    _domPurify = mod.default as { sanitize: (input: string, options: unknown) => string }
  }
  return _domPurify
}

async function sanitizeWithDOMPurify(input: string): Promise<string> {
  const DOMPurify = await getDomPurify()
  const purifyOptions = {
    ALLOWED_TAGS: TRUSTED_ALLOWED_TAGS,
    ALLOWED_ATTR: TRUSTED_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  }
  const result = DOMPurify.sanitize(input, purifyOptions)
  return typeof result === 'string' ? result : String(result)
}

function stripDangerousAttrs(tag: string, attrs: string): string {
  const allowed = ALLOWED_ATTRS[tag]
  if (!allowed) return ''
  return attrs
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*"javascript:[^"]*"/gi, '')
    .replace(/\s+(href|src)\s*=\s*'javascript:[^']*'/gi, '')
    .split(/(?=\s)/)
    .filter(part => {
      const attrName = part.trim().split(/[\s=]/)[0].toLowerCase()
      return !attrName || allowed.has(attrName)
    })
    .join('')
}

function sanitizeMarkup(input: string): string {
  let out = input.replace(/<(script|style|iframe|form|input|button|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
  out = out.replace(/<(script|style|iframe|form|input|button|object|embed)[^>]*\/?>/gi, '')
  out = out.replace(/<\/?([a-z][a-z0-9]*)((?:\s[^>]*)?)\s*\/?>/gi, (match, tag, attrs) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(t)) return ''
    if (match.startsWith('</')) return `</${t}>`
    const safeAttrs = stripDangerousAttrs(t, attrs ?? '')
    return match.trim().endsWith('/>') ? `<${t}${safeAttrs}/>` : `<${t}${safeAttrs}>`
  })
  return out
}

export async function sanitizeEmailSignatureHtml(input: string | null | undefined, trustHtml = false): Promise<string> {
  const value = input?.trim()
  if (!value) return ''
  if (trustHtml) {
    return (await sanitizeWithDOMPurify(value)).trim()
  }
  return sanitizeMarkup(value).trim()
}

export async function stripHtmlToText(input: string | null | undefined, trustHtml = false): Promise<string> {
  const sanitized = await sanitizeEmailSignatureHtml(input, trustHtml)
  if (!sanitized) return ''
  return sanitized
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1 ')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/td>\s*<td>/gi, ' | ')
    .replace(/<\/th>\s*<th>/gi, ' | ')
    .replace(/<\/td>\s*<\/tr>\s*<tr>\s*<td>/gi, '\n')
    .replace(/<\/th>\s*<\/tr>\s*<tr>\s*<th>/gi, '\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
