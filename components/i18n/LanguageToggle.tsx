'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { updateLanguagePreference } from '@/app/api/actions/updateLanguagePreference'
import { setStoredLanguagePreference } from '@/lib/i18n/languageStorage'
import { useLocale } from 'next-intl'
import { toast } from 'sonner'
import type { Locale } from '@/i18n.config'

export function LanguageToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale() as Locale
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLanguageChange = async (newLocale: Locale) => {
    if (newLocale === locale) return

    try {
      setIsLoading(true)

      // Update preference in database
      const result = await updateLanguagePreference(newLocale)
      if (result.error) {
        toast.error('Failed to update language preference')
        return
      }

      // Store preference locally
      setStoredLanguagePreference(newLocale)

      // Build new pathname
      let newPathname = pathname

      // Remove locale prefix from pathname if present
      if (pathname.startsWith(`/${locale}/`)) {
        newPathname = pathname.slice(locale.length + 1)
      } else if (pathname === `/${locale}`) {
        newPathname = '/'
      }

      // Navigate to new locale route
      if (newLocale === 'en') {
        router.push(newPathname)
      } else {
        router.push(`/${newLocale}${newPathname}`)
      }

      toast.success('Language updated')
    } catch (error) {
      console.error('Error updating language:', error)
      toast.error('Failed to update language')
    } finally {
      setIsLoading(false)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="flex gap-1 rounded-lg bg-gray-200 dark:bg-gray-700 p-1">
      <button
        onClick={() => handleLanguageChange('en')}
        disabled={isLoading}
        className={`px-3 py-1 rounded font-medium transition-all disabled:opacity-50 ${
          locale === 'en'
            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-label="English"
      >
        EN
      </button>
      <button
        onClick={() => handleLanguageChange('es')}
        disabled={isLoading}
        className={`px-3 py-1 rounded font-medium transition-all disabled:opacity-50 ${
          locale === 'es'
            ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-label="Español"
      >
        ES
      </button>
    </div>
  )
}
