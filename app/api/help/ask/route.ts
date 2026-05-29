import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import Groq from 'groq-sdk'
import { getHelpSystemPrompt } from '@/lib/help/prompts'
import { z } from 'zod'
import type { Vertical } from '@/lib/vertical'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RequestSchema = z.object({
  question: z.string().min(1).max(500),
  currentPage: z.string().optional().default('/'),
  vertical: z.enum(['dealer', 'real_estate']).optional(),
})

/**
 * POST /api/help/ask
 * Takes a question, current page, and vertical.
 * Calls Groq API with vertical-aware system prompt.
 * Returns: { answer: string } from Groq in ~100ms.
 * Gracefully falls back if Groq is unavailable.
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[help/ask] POST received')
    const profile = await requireProfile()
    console.log('[help/ask] profile verified')
    const supabase = await createClient()

    // Get org vertical
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()
    if (orgError) {
      console.error('[help/ask] org query failed:', orgError.message)
      throw new Error(`Failed to fetch organization: ${orgError.message}`)
    }
    const orgVertical = (org?.vertical ?? 'dealer') as Vertical
    console.log('[help/ask] org vertical:', orgVertical)

    let body: unknown
    try {
      body = await req.json()
    } catch (e) {
      console.error('[help/ask] invalid request body:', e)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[help/ask] validation failed:', parsed.error)
      return NextResponse.json(
        { error: 'Invalid request: ' + parsed.error.message },
        { status: 400 }
      )
    }

    const { question, currentPage, vertical } = parsed.data
    const effectiveVertical = vertical || orgVertical
    console.log('[help/ask] question:', question, 'vertical:', effectiveVertical)

    // Search for relevant articles to ground the response
    console.log('[help/ask] searching for related articles...')
    const { data: relatedArticles } = await supabase
      .from('help_articles')
      .select('question, answer, keywords')
      .in('vertical', [effectiveVertical, 'both'])
      .limit(3)

    console.log('[help/ask] found', relatedArticles?.length || 0, 'related articles')

    // If we found highly relevant articles, return them directly instead of generating
    if (relatedArticles && relatedArticles.length > 0) {
      const bestMatch = relatedArticles[0]
      // Check if any article question closely matches the user's question
      const matchScore = relatedArticles.map((a) => {
        const q = a.question.toLowerCase()
        const userQ = question.toLowerCase()
        const matchCount = userQ.split(/\s+/).filter(word => q.includes(word)).length
        return { article: a, matchCount }
      }).sort((a, b) => b.matchCount - a.matchCount)[0]

      if (matchScore && matchScore.matchCount >= 2) {
        console.log('[help/ask] returning matching article directly')
        return NextResponse.json({
          answer: matchScore.article.answer,
          responseTime: Date.now() - Date.now(),
          model: 'help-articles',
          source: 'article'
        })
      }
    }

    const articleContext = relatedArticles && relatedArticles.length > 0
      ? `\n\nRelevant help articles for reference:\n${relatedArticles.map((a) => `Q: "${a.question}"\nA: ${a.answer}`).join('\n\n')}`
      : ''

    // Check if Groq API key is available
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      console.error('[help/ask] GROQ_API_KEY not configured')
      return NextResponse.json(
        { error: 'Help system unavailable. Please contact support.' },
        { status: 503 }
      )
    }

    // Get system prompt and add article context
    let systemPrompt = getHelpSystemPrompt(effectiveVertical, currentPage)
    if (articleContext) {
      systemPrompt += articleContext
    }
    console.log('[help/ask] system prompt ready with', relatedArticles?.length || 0, 'articles')

    // Call Groq API
    const groq = new Groq({ apiKey: groqApiKey })

    const startTime = Date.now()
    const model = process.env.GROQ_HELP_MODEL ?? 'llama-3.1-8b-instant'
    console.log('[help/ask] calling groq API with model:', model)
    const completion = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: question,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    })
    const responseTime = Date.now() - startTime
    console.log('[help/ask] groq response received in', responseTime, 'ms')

    const answer =
      completion.choices[0]?.message?.content || 'I couldn\'t find an answer to that question. Try browsing our help articles or reaching out to support.'

    return NextResponse.json({
      answer,
      responseTime,
      model: 'groq',
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const errStack = err instanceof Error ? err.stack : ''
    console.error('[help/ask] FATAL ERROR:', errMsg)
    console.error('[help/ask] stack:', errStack)

    // Auth errors
    if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Unauthorized') || errMsg.includes('Authentication')) {
      return NextResponse.json(
        { error: 'Help system temporarily unavailable. Groq API key invalid or revoked.' },
        { status: 503 }
      )
    }

    // Development mode: return full error for debugging
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        {
          error: 'Could not generate answer.',
          debug: errMsg,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Could not generate answer. Try searching our help articles.' },
      { status: 500 }
    )
  }
}
