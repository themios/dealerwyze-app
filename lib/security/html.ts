import sanitizeHtml from 'sanitize-html'

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
] as const

const EMAIL_SIGNATURE_ALLOWED_ATTR: Record<string, string[]> = {
  '*': [
    'align',
    'border',
    'cellpadding',
    'cellspacing',
    'class',
    'color',
    'height',
    'style',
    'valign',
    'width',
  ],
  a: ['href', 'rel', 'target'],
  img: ['alt', 'height', 'src', 'width'],
}

const EMAIL_SIGNATURE_ALLOWED_STYLES: Record<string, Record<string, RegExp[]>> = {
  '*': {
    color: [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'font-family': [/^[,.\s"'a-zA-Z0-9-]+$/],
    'font-size': [/^[.\s%a-zA-Z0-9-]+$/],
    'font-style': [/^[a-zA-Z-]+$/],
    'font-weight': [/^[a-zA-Z0-9-]+$/],
    'line-height': [/^[.\s%a-zA-Z0-9-]+$/],
    margin: [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'margin-bottom': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'margin-left': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'margin-right': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'margin-top': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'text-align': [/^[a-zA-Z-]+$/],
    'text-decoration': [/^[a-zA-Z\s-]+$/],
    'vertical-align': [/^[a-zA-Z-]+$/],
    width: [/^[.\s%a-zA-Z0-9-]+$/],
    height: [/^[.\s%a-zA-Z0-9-]+$/],
    border: [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'border-left': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'border-right': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'border-top': [/^[#(),.%\sa-zA-Z0-9-]+$/],
    'border-bottom': [/^[#(),.%\sa-zA-Z0-9-]+$/],
  },
}

function sanitizeSignatureMarkup(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [...EMAIL_SIGNATURE_ALLOWED_TAGS],
    allowedAttributes: EMAIL_SIGNATURE_ALLOWED_ATTR,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowedStyles: EMAIL_SIGNATURE_ALLOWED_STYLES,
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    parseStyleAttributes: true,
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
    .replace(/<\/tr>\s*<tr>/gi, '\n')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' ')
    .replace(/<\/?(table|tbody|tr|td|th|div|span|p|h[1-6]|strong|em|b|i|u)[^>]*>/gi, '')
    .replace(/<a [^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<img [^>]*alt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<img [^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
