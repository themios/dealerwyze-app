'use client'

import { useTranslations } from 'next-intl'

/**
 * Custom hook to get Wave 2 feature translations
 * Provides type-safe access to buyerCriteria, matches, and showings translations
 */
export function useBuyerCriteriaTranslations() {
  const t = useTranslations('buyerCriteria')
  return t
}

export function useMatchesTranslations() {
  const t = useTranslations('matches')
  return t
}

export function useShowingsTranslations() {
  const t = useTranslations('showings')
  return t
}

export function useCommonTranslations() {
  const t = useTranslations('common')
  return t
}

export function useButtonTranslations() {
  const t = useTranslations('button')
  return t
}

export function useSettingsTranslations() {
  const t = useTranslations('settings')
  return t
}
