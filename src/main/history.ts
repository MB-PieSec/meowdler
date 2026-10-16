import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { parseHistoryEntries, type DownloadItem } from '../shared/downloads'

/** Newest-first cap so a heavy session can never grow the file forever. */
export const MAX_HISTORY_ENTRIES = 200

const HISTORY_FILE = 'history.json'

function historyPath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE)
}

/** Loads the persisted history ledger; unreadable/corrupt yields empty. */
export function readHistory(): DownloadItem[] {
  try {
    return parseHistoryEntries(JSON.parse(fs.readFileSync(historyPath(), 'utf8')) as unknown)
  } catch {
    return []
  }
}

/**
 * Atomically persists the ledger (newest first, capped). A crash mid-write
 * leaves the previous file intact because the tmp file is renamed over it.
 */
export function writeHistory(items: readonly DownloadItem[]): void {
  const capped = items.slice(0, MAX_HISTORY_ENTRIES)
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    const tmp = `${historyPath()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(capped, null, 2), 'utf8')
    fs.renameSync(tmp, historyPath())
  } catch (error) {
    console.error('Failed to persist history:', error)
  }
}
