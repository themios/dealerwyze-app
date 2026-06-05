import DOMPurify from 'isomorphic-dompurify'

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

function sanitizeWithDOMPurify(input: string): string {
  const purifyOptions: any = {
    ALLOWED_TAGS: TRUSTED_ALLOWED_TAGS,
    ALLOWED_ATTR: TRUSTED_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  }
  const result = DOMPurify.sanitize(input, purifyOptions)
  return typeof result === 'string' ? result : result.toString()
}

function stripDangerousAttrs(tag: string, attrs: string): string {
  const allowed = ALLOWED_ATTRS[tag]
  if (!allowed) return ''
  // Remove event handlers and javascript: protocol anywhere
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
  // Strip script/style/iframe/form blocks entirely (including content)
  let out = input.replace(/<(script|style|iframe|form|input|button|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
  // Strip self-closing dangerous tags
  out = out.replace(/<(script|style|iframe|form|input|button|object|embed)[^>]*\/?>/gi, '')
  // Process remaining tags: keep allowed, strip others
  out = out.replace(/<\/?([a-z][a-z0-9]*)((?:\s[^>]*)?)\s*\/?>/gi, (match, tag, attrs) => {
    const t = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(t)) return ''
    if (match.startsWith('</')) return `</${t}>`
    const safeAttrs = stripDangerousAttrs(t, attrs ?? '')
    return match.trim().endsWith('/>') ? `<${t}${safeAttrs}/>` : `<${t}${safeAttrs}>`
  })
  return out
}

export function sanitizeEmailSignatureHtml(input: string | null | undefined, trustHtml: boolean = false): string {
  const value = input?.trim()
  if (!value) return ''

  if (trustHtml) {
    return sanitizeWithDOMPurify(value).trim()
  }

  return sanitizeMarkup(value).trim()
}

export function stripHtmlToText(input: string | null | undefined, trustHtml: boolean = false): string {
  const sanitized = sanitizeEmailSignatureHtml(input, trustHtml)
  if (!sanitized) return ''

  return sanitized
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1 ')
    .replace(/<img[^>]*>/gi, '')
    // Preserve table structure: convert table cells to pipe-separated values
    .replace(/<\/td>\s*<td>/gi, ' | ')
    .replace(/<\/th>\s*<th>/gi, ' | ')
    .replace(/<\/td>\s*<\/tr>\s*<tr>\s*<td>/gi, '\n')
    .replace(/<\/th>\s*<\/tr>\s*<tr>\s*<th>/gi, '\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
