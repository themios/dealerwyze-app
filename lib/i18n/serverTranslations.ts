import { getRequestConfig } from 'next-intl/server'
import { Locale, i18n } from '@/i18n.config'

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  if (!i18n.locales.includes(locale as Locale)) {
    return {}
  }

  try {
    return {
      messages: (await import(`@/public/locales/${locale}.json`)).default,
    }
  } catch (error) {
    console.error(`Failed to load translations for locale: ${locale}`, error)
    // Fall back to English if requested locale fails
    return {
      messages: (await import('@/public/locales/en.json')).default,
    }
  }
})
