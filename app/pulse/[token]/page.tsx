import type { Metadata } from 'next'
import SurveyClient from './SurveyClient'

export const metadata: Metadata = {
  title: 'Share Your Feedback',
}

export default async function PulseSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SurveyClient token={token} />
}
