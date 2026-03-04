'use client'

import { useEffect, useState, useCallback } from 'react'
import { PendingCall } from '@/types'

const STORAGE_KEY = 'dealerwyze_pending_call'

export function setPendingCall(call: PendingCall) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(call))
}

export function clearPendingCall() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getPendingCall(): PendingCall | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function usePendingCall() {
  const [pendingCall, setPendingCallState] = useState<PendingCall | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const checkForPendingCall = useCallback(() => {
    const call = getPendingCall()
    if (call) {
      setPendingCallState(call)
      setModalOpen(true)
    }
  }, [])

  useEffect(() => {
    // Check on mount (in case app was relaunched)
    checkForPendingCall()

    // Check when app regains focus (returning from dialer)
    function handleVisibilityChange() {
      if (!document.hidden) {
        checkForPendingCall()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', checkForPendingCall)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', checkForPendingCall)
    }
  }, [checkForPendingCall])

  function dismissModal() {
    setModalOpen(false)
    setPendingCallState(null)
  }

  return { pendingCall, modalOpen, dismissModal }
}
