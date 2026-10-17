import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { FLAVOR_LABELS, type Flavor } from '../shared/settings'
import type { UpdateCheckOutcome } from '../shared/ipc'
import { TitleBar } from './components/TitleBar'
import { ToastProvider, useToast } from './components/toast'
import { SettingsProvider, useSettings } from './hooks/useSettings'
import { DownloadsProvider, errorText } from './hooks/useDownloads'
import { VIEW_LIST, viewById, type ViewId } from './views'

/**
 * App shell: frameless titlebar + sidebar router + content area.
 * The flavor attribute on <html> is what theme/flavors.css keys on.
 */

function Shell(): JSX.Element {
  const { settings, saveSettings } = useSettings()
  const toast = useToast()
  const [activeView, setActiveView] = useState<ViewId>('home')
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const goTo = (id: ViewId): void => setActiveView(id)

  useEffect(() => {
    document.documentElement.dataset.flavor = settings.flavor
  }, [settings.flavor])

  useEffect(() => {
    void window.meowdler
      .ping()
      .then((info) => setAppVersion(info.appVersion))
      .catch(() => {})
  }, [])

  const pickFlavor = (flavor: Flavor): void => {
    void saveSettings({ ...settings, flavor })
    toast(`${FLAVOR_LABELS[flavor]} theme applied`, 'success')
  }

  const checkUpdates = useCallback((): void => {
    void window.meowdler
      .checkForUpdates(true)
      .then((outcome: UpdateCheckOutcome) => {
        switch (outcome.mode) {
          case 'up-to-date':
            toast(`You're up to date — Meowdler v${outcome.currentVersion}`, 'success')
            return
          case 'available':
            if (outcome.installing) {
              toast(`Downloading ${outcome.latestVersion} — the app restarts once ready`, 'success')
            } else {
              // Format without self-install (deb, unsigned macOS): main
              // opened the releases page.
              toast(
                `Version ${outcome.latestVersion} available — opening the releases page`,
                'info',
              )
            }
            return
          case 'dev':
            toast('Dev build — update checks run in packaged apps only', 'info')
            return
          default:
            toast(outcome.error ?? 'Update check failed', 'danger')
        }
      })
      .catch((error: unknown) => {
        toast(errorText(error), 'danger')
      })
  }, [toast])

  return (
    <div className="app-shell">
      <TitleBar flavor={settings.flavor} onCheckUpdates={checkUpdates} onPickFlavor={pickFlavor} />
      <div className="app-body">
        <aside className="sidebar">
          <nav className="nav">
            {VIEW_LIST.map((view) => {
              const active = view.id === activeView
              return (
                <button
                  className={`nav-item${active ? ' active' : ''}`}
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  title={view.label}
                  type="button"
                >
                  {view.label}
                </button>
              )
            })}
          </nav>
          <div className="sidebar-foot">
            {appVersion === null ? 'Meowdler' : `Meowdler ${appVersion}`}
          </div>
        </aside>

        <main className="content">
          <header className="header">
            <h1 className="heading">{viewById(activeView).heading}</h1>
            <p className="subheading">{viewById(activeView).blurb}</p>
          </header>
          {(() => {
            const View = viewById(activeView).Component
            return <View navigate={goTo} />
          })()}
          <footer className="footer">
            <span className="footer-note">
              yt-dlp engine online — the Queue manages real downloads.
            </span>
          </footer>
        </main>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  return (
    <ToastProvider>
      <SettingsProvider>
        <DownloadsProvider>
          <Shell />
        </DownloadsProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}
