'use client'

import { useState, useEffect } from 'react'
import { getQuestionsForDepth, getFollowUpQuestion, CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Depth, Category, SurveyQuestion } from '@/lib/pulse/questions'

type Stage = 'loading' | 'error' | 'welcome' | 'questions' | 'thankyou'

interface SurveyMeta {
  survey_id: string
  customer_first_name: string
  org_name: string
}

export default function SurveyClient({ token }: { token: string }) {
  const [stage, setStage]         = useState<Stage>('loading')
  const [meta, setMeta]           = useState<SurveyMeta | null>(null)
  const [errorType, setErrorType] = useState('')
  const [depth, setDepth]         = useState<Depth>('standard')
  const [answers, setAnswers]     = useState<Record<string, number>>({})
  const [comments, setComments]   = useState<Record<string, string>>({})
  const [wantsFollowup, setWants] = useState(false)
  const [submitting, setSubmit]   = useState(false)

  useEffect(() => {
    fetch(`/api/pulse/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrorType(d.error); setStage('error'); return }
        setMeta(d)
        setStage('welcome')
      })
      .catch(() => { setErrorType('network'); setStage('error') })
  }, [token])

  const questions = getQuestionsForDepth(depth)

  // Determine adaptive follow-up questions (full depth, category avg <= 3)
  const followUps: SurveyQuestion[] = []
  if (depth === 'full') {
    const cats = [...new Set(questions.map(q => q.category))]
    for (const cat of cats) {
      const catAnswers = questions.filter(q => q.category === cat).map(q => answers[q.key]).filter(Boolean)
      if (catAnswers.length > 0 && catAnswers.reduce((a, b) => a + b, 0) / catAnswers.length <= 3) {
        const fu = getFollowUpQuestion(cat as Category)
        if (fu) followUps.push(fu)
      }
    }
  }

  async function handleSubmit() {
    setSubmit(true)
    const allQuestions = [...questions, ...followUps]
    const responses = allQuestions
      .filter(q => answers[q.key] !== undefined || comments[q.key])
      .map(q => ({
        category:     q.category,
        question_key: q.key,
        score:        answers[q.key] ?? 3,
        comment:      comments[q.key] || undefined,
      }))

    const res = await fetch(`/api/pulse/${token}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth, responses, wants_followup: wantsFollowup }),
    })

    if (res.ok) {
      setStage('thankyou')
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorType(data.error || 'submit_failed')
      setStage('error')
    }
    setSubmit(false)
  }

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  if (stage === 'error') {
    const msg =
      errorType === 'already_completed' ? "You've already submitted your feedback. Thank you!"
      : errorType === 'expired'          ? 'This survey link has expired.'
      : 'Something went wrong. Please try again or contact the dealership directly.'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl mb-3">🙏</p>
          <p className="text-base font-medium text-gray-800">{msg}</p>
        </div>
      </div>
    )
  }

  if (stage === 'welcome') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
          <p className="text-sm font-semibold text-orange-600 uppercase tracking-wide mb-2">{meta?.org_name}</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Hi {meta?.customer_first_name}, your feedback means everything.
          </h1>
          <p className="text-gray-600 mb-6 leading-relaxed">
            A few minutes of your time helps us serve every customer better. Your responses go directly to management and are never shared publicly. Please be honest - it is the most helpful thing you can do for us.
          </p>
          <p className="text-sm font-semibold text-gray-700 mb-3">How much time do you have?</p>
          <div className="space-y-3 mb-8">
            {([
              { value: 'quick' as Depth,    label: 'Quick',    sub: '5 questions - about 60 seconds' },
              { value: 'standard' as Depth, label: 'Standard', sub: 'All areas - about 2-3 minutes' },
              { value: 'full' as Depth,     label: 'Full',     sub: 'All areas + comments - 4-5 minutes' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setDepth(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  depth === opt.value
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStage('questions')}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors"
          >
            Start Survey
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'questions') {
    const unansweredCount = questions.filter(q => answers[q.key] === undefined).length
    const canProceed = unansweredCount === 0

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="mb-6 pt-4">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">{meta?.org_name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {questions.length - unansweredCount} of {questions.length} answered
            </p>
          </div>

          {([...new Set(questions.map(q => q.category))] as Category[]).map(cat => {
            const catQs = questions.filter(q => q.category === cat)
            return (
              <div key={cat} className="bg-white rounded-2xl shadow-sm p-5 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{CATEGORY_LABELS[cat]}</p>
                {catQs.map(q => (
                  <div key={q.key} className="mb-5 last:mb-0">
                    <p className="text-sm font-medium text-gray-800 mb-3">{q.text}</p>
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          onClick={() => setAnswers(p => ({ ...p, [q.key]: n }))}
                          className={`flex-1 h-10 rounded-lg text-sm font-semibold border-2 transition-all ${
                            answers[q.key] === n
                              ? n <= 2 ? 'border-red-400 bg-red-50 text-red-700'
                                : n === 3 ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                                : 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                      <span>Poor</span><span>Excellent</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Adaptive follow-up text questions for low-scoring categories */}
          {followUps.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Help Us Understand</p>
              {followUps.map(q => (
                <div key={q.key} className="mb-4 last:mb-0">
                  <p className="text-sm font-medium text-gray-800 mb-2">{q.text}</p>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-orange-400"
                    rows={3}
                    placeholder="Optional..."
                    value={comments[q.key] ?? ''}
                    onChange={e => setComments(p => ({ ...p, [q.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Follow-up contact preference */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <p className="text-sm font-medium text-gray-800 mb-3">
              Would you like someone from our team to follow up with you?
            </p>
            <div className="flex gap-3">
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  onClick={() => setWants(v)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                    wantsFollowup === v
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {v ? 'Yes please' : 'No thanks'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canProceed || submitting}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors mb-8"
          >
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    )
  }

  // Thank-you stage
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-4xl mb-4">🙏</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Thank you so much.</h1>
        <p className="text-gray-600 leading-relaxed">
          Your feedback has been received and goes directly to management. We take every word seriously - it helps us improve for every customer who comes after you.
        </p>
        {wantsFollowup && (
          <p className="mt-4 text-sm text-orange-600 font-medium">
            Someone from our team will be in touch with you shortly.
          </p>
        )}
      </div>
    </div>
  )
}
