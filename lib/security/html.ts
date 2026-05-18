const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'a', 'img'])
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:   new Set(['href']),
  img: new Set(['src', 'alt', 'width', 'height']),
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

export function sanitizeEmailSignatureHtml(input: string | null | undefined): string {
  const value = input?.trim()
  if (!value) return ''
  return sanitizeMarkup(value).trim()
}

export function stripHtmlToText(input: string | null | undefined): string {
  const sanitized = sanitizeEmailSignatureHtml(input)
  if (!sanitized) return ''

  return sanitized
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '$1')
    .replace(/<em>(.*?)<\/em>/gi, '$1')
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '$1 ')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/?p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
