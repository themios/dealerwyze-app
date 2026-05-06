import DOMPurify from 'isomorphic-dompurify'

const SIGNATURE_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'img'] as const,
  ALLOWED_ATTR: ['href', 'src', 'alt', 'width', 'height'] as const,
}

function sanitizeSignatureMarkup(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [...SIGNATURE_PURIFY_CONFIG.ALLOWED_TAGS],
    ALLOWED_ATTR: [...SIGNATURE_PURIFY_CONFIG.ALLOWED_ATTR],
  })
}

export function sanitizeEmailSignatureHtml(input: string | null | undefined): string {
  const value = input?.trim()
  if (!value) return ''
  return sanitizeSignatureMarkup(value).trim()
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
