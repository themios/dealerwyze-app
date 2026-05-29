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

    // Start with base query
    let dbQuery = supabase
      .from('help_articles')
      .select('id, slug, question, answer, vertical, context_pages, keywords, related_links')

    // Filter by vertical: match org vertical or 'both'
    dbQuery = dbQuery
      .or(`vertical.eq.${vertical},vertical.eq.both`)

    // Filter by context_page if provided
    if (contextPage) {
      dbQuery = dbQuery.contains('context_pages', [contextPage])
    }

    const { data: articles, error } = await dbQuery

    if (error) {
      console.error('Help articles query error:', error)
      return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
    }

    // Client-side keyword matching and ranking
    let results = articles ?? []
    if (query) {
      results = results
        .map((article) => {
          const questionMatch = article.question.toLowerCase().includes(query)
          const answerMatch = article.answer.toLowerCase().includes(query)
          const keywordMatches = (article.keywords ?? []).filter((kw: string) =>
            kw.toLowerCase().includes(query)
          ).length

          const score = (questionMatch ? 3 : 0) + (answerMatch ? 1 : 0) + keywordMatches * 2

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
