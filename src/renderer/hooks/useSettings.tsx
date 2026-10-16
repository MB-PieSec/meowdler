import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/settings'

/**
 * Loads persisted settings on mount and exposes them app-wide, so switching
 * the theme from the titlebar or the Settings page stays in sync.
 */

interface SettingsContextValue {
  loaded: boolean
  settings: AppSettings
  saveSettings: (next: AppSettings) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue>({
  loaded: false,
  settings: DEFAULT_SETTINGS,
  saveSettings: async () => {},
})

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.meowdler
      .getSettings()
      .then((persisted) => {
        if (mounted) {
          setSettings(persisted)
          setLoaded(true)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to load settings:', error)
      })
    return () => {
      mounted = false
    }
  }, [])

  const saveSettings = useCallback(async (next: AppSettings): Promise<void> => {
    const persisted = await window.meowdler.saveSettings(next)
    setSettings(persisted)
  }, [])

  return (
    <SettingsContext.Provider value={{ loaded, settings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}
