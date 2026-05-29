import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
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

    // Step 1: Search for matching help articles
    console.log('[help/ask] searching for matching articles...')
    const { data: allArticles } = await supabase
      .from('help_articles')
      .select('question, answer, keywords')
      .in('vertical', [effectiveVertical, 'both'])

    console.log('[help/ask] found', allArticles?.length || 0, 'total articles for vertical:', effectiveVertical)

    if (allArticles && allArticles.length > 0) {
      // Find articles matching the user's question by word matching
      const queryWords = question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
      console.log('[help/ask] query words:', queryWords)

      const scored = allArticles.map((a) => {
        const qLower = a.question.toLowerCase()
        const aLower = a.answer.toLowerCase()
        const kLower = (a.keywords ?? []).map((k: string) => k.toLowerCase())

        const matchedWords = queryWords.filter(word =>
          qLower.includes(word) ||
          aLower.includes(word) ||
          kLower.some((k: string) => k.includes(word))
        ).length

        return { article: a, score: matchedWords }
      })

      const bestMatch = scored.sort((a, b) => b.score - a.score)[0]
      console.log('[help/ask] best match score:', bestMatch?.score)

      if (bestMatch && bestMatch.score > 0) {
        console.log('[help/ask] returning matching article:', bestMatch.article.question)
        return NextResponse.json({
          answer: bestMatch.article.answer,
          responseTime: 0,
          model: 'help-articles',
          source: 'article'
        })
      }
    }

    // Step 2: If no article match, use system knowledge as RAG context
    // Read SYSTEM_KNOWLEDGE.md to ground AI responses in reality
    console.log('[help/ask] no article match, using system knowledge RAG')
    const systemKnowledgePath = process.cwd() + '/SYSTEM_KNOWLEDGE.md'
    let systemKnowledge = ''
    try {
      const fs = await import('fs')
      systemKnowledge = fs.readFileSync(systemKnowledgePath, 'utf-8')
      console.log('[help/ask] loaded system knowledge, length:', systemKnowledge.length)
    } catch (e) {
      console.warn('[help/ask] could not load SYSTEM_KNOWLEDGE.md:', e instanceof Error ? e.message : String(e))
      systemKnowledge = `(System knowledge unavailable - help based on general knowledge only)`
    }

    // Use Groq API with system knowledge grounding
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      console.error('[help/ask] GROQ_API_KEY not configured')
      return NextResponse.json(
        { error: 'Help system unavailable. Please contact support.' },
        { status: 503 }
      )
    }

    const Groq = (await import('groq-sdk')).default
    const groq = new Groq({ apiKey: groqApiKey })

    const systemPrompt = `You are a helpful support assistant for ${effectiveVertical === 'real_estate' ? 'RealtyWyze' : 'DealerWyze'}, a CRM for ${effectiveVertical === 'real_estate' ? 'real estate agents' : 'car dealerships'}.

You have access to verified system knowledge below. ONLY use information from this knowledge base to answer questions. Do NOT invent UI elements, buttons, pages, or workflows.

If the knowledge base doesn't contain information about the user's question, say: "I don't have information about that in my knowledge base. Please check the help articles or contact support."

Be specific: reference exact page names, button labels, menu items, and step-by-step instructions.

---
VERIFIED SYSTEM KNOWLEDGE:
${systemKnowledge}
---

User context: Currently on page: ${currentPage || 'unknown'}
User vertical: ${effectiveVertical}`

    const startTime = Date.now()
    const model = process.env.GROQ_HELP_MODEL ?? 'llama-3.1-8b-instant'
    console.log('[help/ask] calling groq with RAG, model:', model)

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
      temperature: 0.3, // Lower temp for more factual responses
    })

    const responseTime = Date.now() - startTime
    console.log('[help/ask] groq response received in', responseTime, 'ms')

    const answer =
      completion.choices[0]?.message?.content || `I couldn't generate an answer. Please check the help articles or contact support.`

    return NextResponse.json({
      answer,
      responseTime,
      model: 'groq-rag',
      source: 'rag'
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
