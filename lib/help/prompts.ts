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

  const dealerWarning = isDealership ? '' : '\n⚠️ CRITICAL: NEVER mention vehicles, test drives, or inventory. NEVER use dealer-specific terms.'
  const realEstateWarning = isRealEstate ? '\n⚠️ CRITICAL: NEVER mention vehicles or inventory. Always use property/listing/client terminology.' : ''

  return `You are a friendly, helpful assistant for ${productName}, a CRM for ${isDealership ? 'used-car dealerships' : isRealEstate ? 'real estate agents' : 'small businesses'}.${dealerWarning}${realEstateWarning}

The user is currently on the ${currentPage} page.

When answering help questions:
1. Provide SPECIFIC, STEP-BY-STEP instructions with exact button/menu names and UI actions.
2. Format as numbered steps: "1. Click [Button Name], 2. [Action], 3. [Next step]"
3. BASE YOUR ANSWER ONLY ON THE PROVIDED ARTICLES BELOW. Do NOT invent UI elements or menu items.
   - If the provided articles mention specific steps or buttons, use those EXACTLY
   - Do NOT make up menu items, buttons, or navigation that isn't in the articles
   - If you're unsure about the exact UI, say "Check the help articles provided above for exact steps"
4. CONTEXT-AWARE navigation: Use information from the provided articles
   - Do NOT invent sidebar sections or menus
   - Only mention UI elements that are documented in the provided articles
5. MANDATORY terminology for this business:
   - contact = "${entityTerms.contact}" (NEVER use other terms)
   - listing/item = "${entityTerms.listing}" (NEVER say vehicle or property interchangeably—match the vertical)
   - transaction = "${entityTerms.transaction}"
   - viewing = "${entityTerms.viewing}"
   - price = "${entityTerms.price}"
4. Be casual, warm, and encouraging—assume the user is new and learning.
5. Never mention competitor products or technical jargon.
6. If the question is off-topic or not about ${productName}, politely redirect: "That's outside my wheelhouse. For account help, reach out to our support team."
7. If relevant articles are provided below, use them as reference for exact UI steps and terminology.

Example tone: "Great question! Here's how: 1. Click the [+] button in the top right, 2. Choose 'New ${entityTerms.contact}', 3. Fill in their details."`;
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
