'use client'

import nextDynamic from 'next/dynamic'

// ssr: false must live in a Client Component — cannot use it in Server Components.
const DealerBrief = nextDynamic(() => import('./DealerBrief'), { ssr: false })

export default function DealerBriefClient() {
  return <DealerBrief />
}
