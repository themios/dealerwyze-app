import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import type { Vertical } from '@/lib/vertical'

export const dynamic = 'force-dynamic'

interface SearchParams {
  query?: string
  vertical?: Vertical
  context_page?: string
}

/**
 * GET /api/help/articles
 * Search help articles by keyword, filter by vertical and context_page.
 * Query params: query, vertical, context_page
 * Returns: matching articles with related_links
 */
export async function GET(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Get org vertical
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()
    const orgVertical = (org?.vertical ?? 'dealer') as Vertical

    const searchParams = req.nextUrl.searchParams
    const query = searchParams.get('query')?.trim().toLowerCase() || ''
    const contextPage = searchParams.get('context_page') || ''
    const vertical = (searchParams.get('vertical') as Vertical) || orgVertical

    // Get all articles for this vertical and 'both', filter context_pages on client
    console.log('[articles] Fetching articles for vertical:', vertical)

    // Fetch articles for specific vertical and 'both' using IN operator
    const { data: articles, error, status } = await supabase
      .from('help_articles')
      .select('id, slug, question, answer, vertical, context_pages, keywords, related_links')
      .in('vertical', [vertical, 'both'])

    console.log('[articles] Query status:', status, 'Got', articles?.length || 0, 'articles, error:', error?.message)
    if (error) {
      console.error('Help articles query error:', error.message, error.details, error.hint)
      // Dev mode: return actual error
      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({ error: error.message, details: error.details }, { status: 500 })
      }
      return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
    }

    if (!articles || articles.length === 0) {
      console.log('[articles] No articles returned from query for vertical:', vertical)
      return NextResponse.json({ articles: [], count: 0 })
    }

    // Filter by context_page if provided, but fall back to all articles if nothing matches
    let results = articles ?? []
    if (contextPage) {
      const contextFiltered = results.filter((article) =>
        (article.context_pages ?? []).includes(contextPage)
      )
      // If context-specific articles exist, use them; otherwise use all articles
      results = contextFiltered.length > 0 ? contextFiltered : results
    }

    // Client-side keyword matching and ranking
    if (query) {
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      results = results
        .map((article) => {
          const questionLower = article.question.toLowerCase()
          const answerLower = article.answer.toLowerCase()
          const keywordsLower = (article.keywords ?? []).map((k: string) => k.toLowerCase())

          // Match on individual words, not the whole query string
          const matchedWords = queryWords.filter(word =>
            questionLower.includes(word) ||
            answerLower.includes(word) ||
            keywordsLower.some(kw => kw.includes(word))
          )

          const questionMatch = questionLower.split(/\s+/).filter(w => queryWords.includes(w)).length
          const answerMatch = answerLower.split(/\s+/).filter(w => queryWords.includes(w)).length

          const score = (questionMatch * 3) + (answerMatch * 1) + matchedWords.length * 2

          return { article, score }
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.article)
        .slice(0, 10) // Limit to 10 results
    }

    return NextResponse.json({
      articles: results,
      count: results.length,
    })
  } catch (err) {
    console.error('Help articles API error:', err)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
