'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  applyPreferences, DEFAULT_PREFERENCES, FONT_STORAGE_KEY, THEME_STORAGE_KEY,
  readPreferences, type AccessibilityPreferences, type FontScale, type ThemePreference,
} from '@/lib/accessibility'

interface AccessibilityContextValue extends AccessibilityPreferences {
  ready: boolean
  setFontScale: (scale: FontScale) => void
  setTheme: (theme: ThemePreference) => void
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null)

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  // Stable server/client first render; the head script already applies the appearance.
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setPreferences(readPreferences())
    setReady(true)
    function syncStorage(event: StorageEvent) {
      if (event.key === null || event.key === FONT_STORAGE_KEY || event.key === THEME_STORAGE_KEY) {
        setPreferences(readPreferences())
      }
    }
    window.addEventListener('storage', syncStorage)
    return () => window.removeEventListener('storage', syncStorage)
  }, [])

  useEffect(() => {
    if (!ready) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyPreferences(preferences, media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preferences, ready])

  function setFontScale(fontScale: FontScale) {
    setPreferences(current => ({ ...current, fontScale }))
    try { localStorage.setItem(FONT_STORAGE_KEY, String(fontScale)) } catch {}
  }

  function setTheme(theme: ThemePreference) {
    setPreferences(current => ({ ...current, theme }))
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch {}
  }

  return (
    <AccessibilityContext.Provider value={{ ...preferences, ready, setFontScale, setTheme }}>
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) throw new Error('useAccessibility requires AccessibilityProvider')
  return context
}
