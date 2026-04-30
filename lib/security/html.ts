import DOMPurify from 'isomorphic-dompurify'

const EMAIL_SIGNATURE_ALLOWED_TAGS = [
  'a',
  'b',
  'br',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'img',
  'p',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'tr',
  'u',
]

const EMAIL_SIGNATURE_ALLOWED_ATTR = [
  'align',
  'alt',
  'border',
  'cellpadding',
  'cellspacing',
  'class',
  'color',
  'height',
  'href',
  'rel',
  'src',
  'style',
  'target',
  'valign',
  'width',
]

export function sanitizeEmailSignatureHtml(input: string | null | undefined): string {
  const value = input?.trim()
  if (!value) return ''

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: EMAIL_SIGNATURE_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_SIGNATURE_ALLOWED_ATTR,
    FORBID_TAGS: ['script', 'style'],
  })
    .trim()
}

export function stripHtmlToText(input: string | null | undefined): string {
  return sanitizeEmailSignatureHtml(input)
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
