import { headers } from 'next/headers'
import type { Vertical } from '@/lib/vertical'
import SignupForm from './SignupForm'

export default async function SignupPage() {
  const headersList = await headers()
  const vertical = (headersList.get('x-vertical') ?? 'dealer') as Vertical

  return <SignupForm vertical={vertical} />
}
