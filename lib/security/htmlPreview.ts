'use client'

const ALLOWED_TAGS = new Set([
  'A', 'B', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I', 'IMG', 'P', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'TR', 'U',
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['align', 'border', 'cellpadding', 'cellspacing', 'class', 'color', 'height', 'style', 'valign', 'width']),
  A: new Set(['href', 'rel', 'target']),
  IMG: new Set(['alt', 'height', 'src', 'width']),
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim()
  return /^(https?:|mailto:|tel:)/i.test(trimmed)
}

function sanitizeNode(node: Node): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const element = node as HTMLElement
  const tag = element.tagName

  if (tag === 'SCRIPT' || tag === 'STYLE') {
    element.remove()
    return
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = element.parentNode
    if (!parent) return
    while (element.firstChild) parent.insertBefore(element.firstChild, element)
    element.remove()
    return
  }

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase()
    const globalAllowed = ALLOWED_ATTRS['*'].has(name)
    const tagAllowed = ALLOWED_ATTRS[tag]?.has(name) ?? false

    if (!globalAllowed && !tagAllowed) {
      element.removeAttribute(attr.name)
      continue
    }

    if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
      element.removeAttribute(attr.name)
    }
  }

  for (const child of Array.from(element.childNodes)) sanitizeNode(child)
}

export function sanitizeEmailSignatureHtmlPreview(input: string | null | undefined): string {
  const value = input?.trim()
  if (!value || typeof document === 'undefined') return ''

  const template = document.createElement('template')
  template.innerHTML = value
  for (const child of Array.from(template.content.childNodes)) sanitizeNode(child)
  return template.innerHTML.trim()
}
