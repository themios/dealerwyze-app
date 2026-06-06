import type { ExtractedListing } from '@/lib/listings/bulkExtractor'

export type ListingEditState = ExtractedListing & {
  id: string // temp UUID for grid key
  selected: boolean
  extractionError?: string
}

export type BulkExtractorState = {
  content: string
  loading: boolean
  items: ListingEditState[]
  globalError?: string
  selectedCount: number
}
