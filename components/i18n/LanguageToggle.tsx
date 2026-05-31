'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { setStoredLanguagePreference, getStoredLanguagePreference } from '@/lib/i18n/languageStorage'
import { useLocale } from 'next-intl'
import type { Locale } from '@/i18n.config'

export function LanguageToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale() as Locale
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLanguageChange = (newLocale: Locale) => {
    if (newLocale === locale) return

    // Store preference locally
    setStoredLanguagePreference(newLocale)

    // Navigate to the new locale
    // Remove current locale from pathname if present
    let newPathname = pathname
    if (pathname.startsWith(`/${locale}/`)) {
      newPathname = pathname.slice(locale.length + 1)
    } else if (pathname === `/${locale}`) {
      newPathname = '/'
    }

    // Add new locale if not English (default)
    if (newLocale === 'en') {
      router.push(newPathname)
    } else {
      router.push(`/${newLocale}${newPathname}`)
    }
  }

  if (!mounted) {
    return null
  }

  return (
    <div className="flex gap-1 rounded-lg bg-gray-200 dark:bg-gray-700 p-1">
      <button
        onClick={() => handleLanguageChange('en')}
        className={`px-3 py-1 rounded font-medium transition-all ${
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
        className={`px-3 py-1 rounded font-medium transition-all ${
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
