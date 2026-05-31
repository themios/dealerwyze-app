import { Locale } from '@/i18n.config'

const LANGUAGE_PREFERENCE_KEY = 'dealerwyze_language_preference'

/**
 * Get user's language preference from localStorage (client-side only)
 */
export function getStoredLanguagePreference(): Locale | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(LANGUAGE_PREFERENCE_KEY)
    return (stored === 'es' || stored === 'en') ? stored : null
  } catch {
    return null
  }
}

/**
 * Store user's language preference to localStorage (client-side only)
 */
export function setStoredLanguagePreference(locale: Locale): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, locale)
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Store language preference to database
 * Called from server action
 */
export async function storeLanguagePreferenceInDb(locale: Locale): Promise<void> {
  // This will be called via server action from LanguageToggle component
  // Import and use in a server action that calls updateUserLanguagePreference
}
