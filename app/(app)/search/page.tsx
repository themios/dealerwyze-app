import { headers } from 'next/headers'
import SearchClient from './SearchClient'

export default async function SearchPage() {
  const hdrs = await headers()
  const isRe = hdrs.get('x-vertical') === 'real_estate'
  return <SearchClient isRe={isRe} />
}
