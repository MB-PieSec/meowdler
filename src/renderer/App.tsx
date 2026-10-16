import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { FLAVOR_LABELS, type Flavor } from '../shared/settings'
import { TitleBar } from './components/TitleBar'
import { ToastProvider, useToast } from './components/toast'
import { SettingsProvider, useSettings } from './hooks/useSettings'
import { DownloadsProvider } from './hooks/useDownloads'
import { VIEW_LIST, viewById, type ViewId } from './views'

/**
 * App shell: frameless titlebar + sidebar router + content area.
 * The flavor attribute on <html> is what theme/flavors.css keys on.
 */

function Shell(): JSX.Element {
  const { settings, saveSettings } = useSettings()
  const toast = useToast()
  const [activeView, setActiveView] = useState<ViewId>('home')
  const goTo = (id: ViewId): void => setActiveView(id)

  useEffect(() => {
    document.documentElement.dataset.flavor = settings.flavor
  }, [settings.flavor])

  const pickFlavor = (flavor: Flavor): void => {
    void saveSettings({ ...settings, flavor })
    toast(`${FLAVOR_LABELS[flavor]} theme applied`, 'success')
  }

  return (
    <div className="app-shell">
      <TitleBar flavor={settings.flavor} onPickFlavor={pickFlavor} />
      <div className="app-body">
        <aside className="sidebar">
          <nav className="nav">
            {VIEW_LIST.map((view) => {
              const active = view.id === activeView
              const locked = view.lockedPhase !== null
              return (
                <button
                  className={`nav-item${active ? ' active' : ''}`}
                  disabled={locked}
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  title={locked ? `Unlocks in Phase ${view.lockedPhase}` : view.label}
                  type="button"
                >
                  {view.label}
                  {locked ? <span className="chip chip-neutral">P{view.lockedPhase}</span> : null}
                </button>
              )
            })}
          </nav>
          <div className="sidebar-foot">Phase 5 — YouTube, X &amp; Instagram online</div>
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
              Phase 2 · yt-dlp engine online — Queue manages real downloads.
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
