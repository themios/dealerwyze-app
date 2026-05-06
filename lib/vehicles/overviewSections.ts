export type OverviewSection = { heading: string; lines: string[] }

function stripBullet(line: string): string {
  return line.replace(/^[-•*]\s+/, '').trim()
}

/** Join lines that are clearly mid-sentence continuations (fixes bad pastes / old AI output). */
function mergeContinuationLines(lines: string[]): string[] {
  if (lines.length <= 1) return lines
  const out: string[] = []
  let acc = lines[0].trim()
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    const accEndsSentence = /[.!?]"?\s*$/.test(acc)
    const lineLooksLikeNewSentence = /^[A-Z(]/.test(line) && line.length > 3
    const lineLooksLikeFragment =
      /^[a-z]/.test(line) ||
      /^(and|or|with|including|plus|as well as)\b/i.test(line) ||
      (!accEndsSentence && line.length > 0)
    if (!accEndsSentence || (lineLooksLikeFragment && !lineLooksLikeNewSentence)) {
      acc = `${acc} ${line}`
    } else {
      out.push(acc)
      acc = line
    }
  }
  out.push(acc)
  return out.filter(Boolean)
}

/**
 * Parse stored overview text into sections for the public VDP.
 * Format: blocks separated by a blank line; first line = heading; following lines = body (ideally one sentence each).
 * Single flowing paragraph (no blank lines): keep as one "Overview" block — do not split on commas (that caused fragments).
 */
export function parseOverviewSections(raw: string | null | undefined): OverviewSection[] {
  if (!raw?.trim()) return []
  const text = raw.trim()
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  const sections: OverviewSection[] = []

  for (const block of blocks) {
    const rawLines = block
      .split('\n')
      .map(l => stripBullet(l.trim()))
      .filter(Boolean)

    if (rawLines.length === 0) continue

    const [first, ...rest] = rawLines

    if (rest.length === 0) {
      sections.push({ heading: 'Overview', lines: [first] })
      continue
    }

    if (/^overview\s*$/i.test(first) && rest.length > 0) {
      sections.push({ heading: 'Overview', lines: mergeContinuationLines(rest) })
      continue
    }

    // Pasted prose often uses one line per "sentence" with no real section titles — first line is a sentence, not a heading.
    const firstLineLooksLikeSentence =
      /[.?]\s*$/.test(first) || (/!\s*$/.test(first) && first.length > 28)

    if (firstLineLooksLikeSentence) {
      sections.push({ heading: 'Overview', lines: mergeContinuationLines(rawLines) })
      continue
    }

    sections.push({ heading: first, lines: mergeContinuationLines(rest) })
  }

  return sections
}

/** Flatten sections for meta description / JSON-LD snippets. */
export function flattenOverviewForMeta(raw: string | null | undefined, maxLen: number): string {
  const secs = parseOverviewSections(raw)
  if (secs.length === 0) return ''
  const flat = secs
    .map(s => [s.heading, ...s.lines].filter(Boolean).join('. '))
    .join(' ')
  const one = flat.replace(/\s+/g, ' ').trim()
  if (one.length <= maxLen) return one
  return one.slice(0, maxLen).trimEnd() + '…'
}
