import { useEffect, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import { FLAVORS, FLAVOR_LABELS, type Flavor } from '../../shared/settings'
import {
  IconClose,
  IconDownloadCloud,
  IconMaximize,
  IconMinimize,
  IconPaw,
  IconRestore,
} from './icons'

/**
 * Frameless custom titlebar: draggable header holding the brand, a flavor
 * picker (each dot previews the flavor's accent color), and window controls.
 * Window chrome was removed via `frame: false`, so this component repatriates
 * dragging + minimize/maximize/close over IPC.
 */

/** Swatch color per flavor dot (identifies the flavor, not the theme). */
const FLAVOR_DOT: Record<Flavor, string> = {
  mocha: '#cba6f7',
  macchiato: '#c6a0f6',
  frappe: '#ca9ee6',
  latte: '#1e66f5',
}

interface TitleBarProps {
  flavor: Flavor
  onPickFlavor: (flavor: Flavor) => void
  onCheckUpdates: () => void
}

export function TitleBar({ flavor, onPickFlavor, onCheckUpdates }: TitleBarProps): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.meowdler
      .isWindowMaximized()
      .then((current) => {
        if (mounted) setMaximized(current)
      })
      .catch(() => {})
    const unsubscribe = window.meowdler.onWindowMaximizedChange(setMaximized)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    // Buttons and the flavor picker keep their own double-clicks.
    if ((event.target as Element).closest('button') === null) {
      window.meowdler.toggleWindowMaximize()
    }
  }

  return (
    <div className="titlebar" onDoubleClick={handleDoubleClick}>
      <div className="titlebar-brand">
        <span className="brand-mark">
          <IconPaw size={17} />
        </span>
        Meowdler
      </div>

      <div className="titlebar-actions">
        <div aria-label="Catppuccin flavor" className="flavor-picker" title="Catppuccin flavor">
          {FLAVORS.map((option) => (
            <button
              className={`flavor-dot${option === flavor ? ' active' : ''}`}
              key={option}
              onClick={() => onPickFlavor(option)}
              style={{ background: FLAVOR_DOT[option] }}
              title={`${FLAVOR_LABELS[option]} theme`}
              type="button"
            />
          ))}
        </div>

        <button
          className="tb-update"
          onClick={onCheckUpdates}
          title="Check for updates"
          type="button"
        >
          <IconDownloadCloud size={15} />
          <span>Check updates</span>
        </button>

        <div className="win-controls">
          <button onClick={() => window.meowdler.minimizeWindow()} title="Minimize" type="button">
            <IconMinimize />
          </button>
          <button
            onClick={() => window.meowdler.toggleWindowMaximize()}
            title={maximized ? 'Restore' : 'Maximize'}
            type="button"
          >
            {maximized ? <IconRestore /> : <IconMaximize />}
          </button>
          <button
            className="close"
            onClick={() => window.meowdler.closeWindow()}
            title="Close"
            type="button"
          >
            <IconClose />
          </button>
        </div>
      </div>
    </div>
  )
}
