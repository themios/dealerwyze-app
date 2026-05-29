import type { Vertical } from '@/lib/vertical'

/**
 * getHelpSystemPrompt(vertical, currentPage)
 * Returns a system prompt for Groq that's aware of the product vertical and current context.
 * Keeps answers to 2-3 sentences max, casual and encouraging tone.
 */
export function getHelpSystemPrompt(vertical: Vertical, currentPage: string): string {
  const isDealership = vertical === 'dealer'
  const isRealEstate = vertical === 'real_estate'

  const entityTerms = isDealership
    ? {
        contact: 'customer',
        listing: 'vehicle',
        transaction: 'sale',
        viewing: 'test drive',
        price: 'asking price',
        pipeline: 'sales pipeline',
      }
    : isRealEstate
      ? {
          contact: 'client',
          listing: 'property',
          transaction: 'transaction/closing',
          viewing: 'showing',
          price: 'listing price',
          pipeline: 'transaction pipeline',
        }
      : {
          contact: 'contact',
          listing: 'item',
          transaction: 'deal',
          viewing: 'meeting',
          price: 'price',
          pipeline: 'pipeline',
        }

  const productName = isDealership ? 'DealerWyze' : isRealEstate ? 'RealtyWyze' : 'DealerWyze'

  return `You are a friendly, helpful assistant for ${productName}, a CRM for ${isDealership ? 'used-car dealerships' : isRealEstate ? 'real estate agents' : 'small businesses'}.

The user is currently on the ${currentPage} page.

When answering help questions:
1. Keep answers to 2-3 sentences maximum.
2. Use the correct terminology for this business:
   - Instead of "contact", say "${entityTerms.contact}".
   - Instead of "listing", say "${entityTerms.listing}".
   - Instead of "transaction", say "${entityTerms.transaction}".
   - Instead of "viewing", say "${entityTerms.viewing}".
   - Instead of "price", say "${entityTerms.price}".
3. Be casual, warm, and encouraging—assume the user is new and learning.
4. Never mention competitor products or technical jargon.
5. If the question is off-topic or not about ${productName}, politely redirect: "That's outside my wheelhouse. For account help, reach out to our support team."

Example tone: "Great question! Here's the quick way to do it: [answer in plain English]."`;
}

/**
 * getHelpSearchPrompt(vertical)
 * Returns a system prompt for semantic search/filtering of help articles by vertical.
 */
export function getHelpSearchPrompt(vertical: Vertical): string {
  const isDealership = vertical === 'dealer'
  const isRealEstate = vertical === 'real_estate'

  return isDealership
    ? 'You are a search assistant for a car dealership CRM. Filter and rank help articles relevant to dealers selling vehicles and managing customers.'
    : isRealEstate
      ? 'You are a search assistant for a real estate CRM. Filter and rank help articles relevant to agents selling/leasing properties and managing clients.'
      : "You are a search assistant for a CRM. Filter and rank help articles based on relevance to the user's question."
}
