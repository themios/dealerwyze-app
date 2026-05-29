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
    const profile = await requireProfile()
    const supabase = await createClient()

    // Get org vertical
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()
    const orgVertical = (org?.vertical ?? 'dealer') as Vertical

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request: ' + parsed.error.message },
        { status: 400 }
      )
    }

    const { question, currentPage, vertical } = parsed.data
    const effectiveVertical = vertical || orgVertical

    // Check if Groq API key is available
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      return NextResponse.json(
        { error: 'Help system unavailable. Please contact support.' },
        { status: 503 }
      )
    }

    // Get system prompt
    const systemPrompt = getHelpSystemPrompt(effectiveVertical, currentPage)

    // Call Groq API
    const groq = new Groq({ apiKey: groqApiKey })

    const startTime = Date.now()
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_HELP_MODEL ?? 'mixtral-8x7b-32768',
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

    const answer =
      completion.choices[0]?.message?.content || 'I couldn\'t find an answer to that question. Try browsing our help articles or reaching out to support.'

    return NextResponse.json({
      answer,
      responseTime,
      model: 'groq',
    })
  } catch (err) {
    console.error('Help ask API error:', err)

    // Graceful fallback
    if (err instanceof Error) {
      if (err.message.includes('401') || err.message.includes('403')) {
        return NextResponse.json(
          { error: 'Help system temporarily unavailable. Try searching articles instead.' },
          { status: 503 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Could not generate answer. Try searching our help articles.' },
      { status: 500 }
    )
  }
}
