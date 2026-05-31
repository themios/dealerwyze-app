'use server'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { Locale } from '@/i18n.config'

/**
 * Update user's language preference in the database
 * Called from LanguageToggle component
 */
export async function updateLanguagePreference(locale: Locale) {
  try {
    const profile = await requireProfile()
    if (!profile) {
      return { error: 'Unauthorized' }
    }

    const supabase = await createClient()

    // Update the user's language preference
    const { error } = await supabase
      .from('profiles')
      .update({ language_preference: locale })
      .eq('id', profile.id)

    if (error) {
      console.error('Failed to update language preference:', error)
      return { error: 'Failed to update language preference' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error updating language preference:', error)
    return { error: 'An error occurred' }
  }
}
