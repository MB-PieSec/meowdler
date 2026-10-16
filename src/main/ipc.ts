import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type EngineInfo,
  type MaximizedPayload,
  type PingResponse,
  type UpdateCheckOutcome,
} from '../shared/ipc'
import type { DownloadItem, MediaPreview, SubmitResult } from '../shared/downloads'
import { parseDownloadOptions } from '../shared/downloads'
import { parseSettings, type AppSettings } from '../shared/settings'
import { DownloadError, type DownloadManager } from './downloads'
import { loadSettings, saveSettings } from './settings'
import { readEngineVersions } from './ytdlp'
import { runUpdateCheck } from './updater'

/** Any event carrying a `sender` web contents. */
type IpcEvent = Electron.IpcMainEvent | Electron.IpcMainInvokeEvent

/** Returns the BrowserWindow that originated an IPC message, if any. */
function senderWindow(event: IpcEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * Registers every main-process IPC handler.
 * Call once from the app `whenReady` hook.
 */
export function registerIpcChannels(manager: DownloadManager): void {
  // -- Environment check ------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.appPing, (): PingResponse => ({
    appName: app.getName(),
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform,
    receivedAt: Date.now(),
  }))

  // -- Settings ----------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.settingsGet, (): AppSettings => loadSettings())

  // Input is `unknown` from the wire: validated via parseSettings, which
  // replaces anything unrecognized with defaults.
  ipcMain.handle(IPC_CHANNELS.settingsSave, (_event, next: unknown): AppSettings =>
    saveSettings(parseSettings(next)),
  )

  // -- Engine auth ---------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.dialogCookies, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a cookies.txt file',
      properties: ['openFile'],
      filters: [{ name: 'cookies.txt', extensions: ['txt', 'cookies'] }],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC_CHANNELS.dialogDownloadDir, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Choose the download folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC_CHANNELS.appEngineInfo, async (): Promise<EngineInfo> => {
    return readEngineVersions()
  })

  ipcMain.handle(
    IPC_CHANNELS.appUpdateCheck,
    async (_event, prompt: unknown): Promise<UpdateCheckOutcome> => {
      return runUpdateCheck(prompt === true, senderWindow(_event) ?? undefined)
    },
  )

  // -- Window controls ---------------------------------------------------------
  ipcMain.on(IPC_CHANNELS.winMinimize, (event): void => {
    senderWindow(event)?.minimize()
  })

  ipcMain.on(IPC_CHANNELS.winMaximizeToggle, (event): void => {
    const win = senderWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.handle(
    IPC_CHANNELS.winMaximizeGet,
    (event): MaximizedPayload => senderWindow(event)?.isMaximized() ?? false,
  )

  ipcMain.on(IPC_CHANNELS.winClose, (event): void => {
    senderWindow(event)?.close()
  })

  // -- Downloads (Phase 2 engine) ------------------------------------------------
  // Input is `unknown` from the wire: ids must be non-empty strings.
  const readId = (value: unknown): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new DownloadError('Missing download id')
    }
    return value
  }

  ipcMain.handle(
    IPC_CHANNELS.downloadSubmit,
    (_event, url: unknown, options: unknown): Promise<SubmitResult> => {
      if (typeof url !== 'string') throw new DownloadError('URL must be a string')
      return manager.submit(url, parseDownloadOptions(options))
    },
  )
  ipcMain.handle(IPC_CHANNELS.downloadList, (): DownloadItem[] => manager.list())
  ipcMain.handle(IPC_CHANNELS.downloadPreview, (_event, url: unknown): Promise<MediaPreview> => {
    if (typeof url !== 'string') throw new DownloadError('URL must be a string')
    return manager.preview(url)
  })

  ipcMain.on(IPC_CHANNELS.downloadPause, (_event, id: unknown): void => {
    manager.pause(readId(id))
  })
  ipcMain.on(IPC_CHANNELS.downloadResume, (_event, id: unknown): void => {
    manager.resume(readId(id))
  })
  ipcMain.on(IPC_CHANNELS.downloadCancel, (_event, id: unknown): void => {
    manager.cancel(readId(id))
  })
  ipcMain.on(IPC_CHANNELS.downloadRetry, (_event, id: unknown): void => {
    manager.retry(readId(id))
  })
  ipcMain.on(IPC_CHANNELS.downloadRemove, (_event, id: unknown): void => {
    manager.remove(readId(id))
  })
  ipcMain.on(IPC_CHANNELS.downloadReveal, (_event, id: unknown): void => {
    manager.reveal(readId(id))
  })
  ipcMain.handle(IPC_CHANNELS.downloadOpen, async (_event, id: unknown): Promise<string | null> => {
    return manager.open(readId(id))
  })
  ipcMain.handle(IPC_CHANNELS.downloadClearHistory, (): void => manager.clearHistory())
}
