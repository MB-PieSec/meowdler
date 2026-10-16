import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, parseSettings, type AppSettings } from '../shared/settings'

const SETTINGS_FILE = 'settings.json'

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

/**
 * Loads settings from disk. Any unreadable/corrupt/unknown file yields
 * defaults — settings must never break app startup.
 */
export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    return parseSettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Persists settings, creating the directory when needed. Returns the same
 * settings for convenient IPC round-tripping.
 */
export function saveSettings(next: AppSettings): AppSettings {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to persist settings:', error)
  }
  return next
}
