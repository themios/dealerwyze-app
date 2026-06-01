import { getRequestConfig } from 'next-intl/server'
import { Locale, i18n } from '@/i18n.config'

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  let validLocale = locale as Locale
  if (!i18n.locales.includes(validLocale)) {
    validLocale = i18n.defaultLocale
  }

  try {
    return {
      locale: validLocale,
      messages: (await import(`@/public/locales/${validLocale}.json`)).default,
    }
  } catch (error) {
    console.error(`Failed to load translations for locale: ${validLocale}`, error)
    // Fall back to English if requested locale fails
    return {
      locale: i18n.defaultLocale,
      messages: (await import('@/public/locales/en.json')).default,
    }
  }
})
