export interface MarketSignal {
  headline: string
  source: string
  url: string
}

// Automotive News RSS (public feed, no auth required)
const RSS_FEEDS = [
  { url: 'https://www.autonews.com/rss/section/retail.rss', source: 'Automotive News' },
  { url: 'https://www.autonews.com/rss/section/used-cars.rss', source: 'Automotive News' },
]

export async function fetchMarketSignals(maxItems = 4): Promise<MarketSignal[]> {
  const signals: MarketSignal[] = []

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DealerWyze/1.0)' },
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue

      const xml = await res.text()
      const items = parseRssItems(xml, feed.source)
      signals.push(...items)

      if (signals.length >= maxItems) break
    } catch {
      // RSS feed unavailable — skip silently
    }
  }

  return signals.slice(0, maxItems)
}

function parseRssItems(xml: string, source: string): MarketSignal[] {
  const items: MarketSignal[] = []
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)

  for (const match of itemMatches) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    if (title && link) {
      items.push({ headline: title, source, url: link })
    }
    if (items.length >= 3) break
  }

  return items
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`))
  return m ? (m[1] ?? m[2] ?? '').trim() : ''
}
