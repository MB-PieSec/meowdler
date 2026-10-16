import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type EngineInfo,
  type MaximizedPayload,
  type PingResponse,
  type UpdateCheckOutcome,
} from '../shared/ipc'
import type {
  DownloadChangedPayload,
  DownloadItem,
  DownloadOptions,
  MediaPreview,
  SubmitResult,
} from '../shared/downloads'
import type { AppSettings } from '../shared/settings'
import type { MeowdlerApi } from '../shared/api'

/** The complete renderer-facing API, exposed safely via the context bridge. */
const meowdlerApi = {
  ping: (): Promise<PingResponse> => ipcRenderer.invoke(IPC_CHANNELS.appPing),

  // -- Settings ---------------------------------------------------------------
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),

  saveSettings: (next: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.settingsSave, next),

  // -- Window controls ----------------------------------------------------------
  minimizeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.winMinimize)
  },

  toggleWindowMaximize: (): void => {
    ipcRenderer.send(IPC_CHANNELS.winMaximizeToggle)
  },

  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.winMaximizeGet),

  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, maximized: MaximizedPayload): void => {
      callback(maximized)
    }
    ipcRenderer.on(IPC_CHANNELS.winMaximizedChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.winMaximizedChanged, listener)
    }
  },

  closeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.winClose)
  },

  // -- Downloads ----------------------------------------------------------------
  submitDownload: (url: string, options?: DownloadOptions): Promise<SubmitResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadSubmit, url, options ?? null),

  listDownloads: (): Promise<DownloadItem[]> => ipcRenderer.invoke(IPC_CHANNELS.downloadList),

  previewMedia: (url: string): Promise<MediaPreview> =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadPreview, url),

  pickCookiesFile: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.dialogCookies),

  pickDownloadFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.dialogDownloadDir),

  engineInfo: (): Promise<EngineInfo> => ipcRenderer.invoke(IPC_CHANNELS.appEngineInfo),

  checkForUpdates: (prompt: boolean): Promise<UpdateCheckOutcome> =>
    ipcRenderer.invoke(IPC_CHANNELS.appUpdateCheck, prompt),

  pauseDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadPause, id)
  },

  resumeDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadResume, id)
  },

  cancelDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadCancel, id)
  },

  retryDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadRetry, id)
  },

  removeDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadRemove, id)
  },

  revealDownload: (id: string): void => {
    ipcRenderer.send(IPC_CHANNELS.downloadReveal, id)
  },

  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.downloadClearHistory),

  onDownloadChanged: (callback: (item: DownloadChangedPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, item: DownloadChangedPayload): void => {
      callback(item)
    }
    ipcRenderer.on(IPC_CHANNELS.downloadChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.downloadChanged, listener)
    }
  },
} satisfies MeowdlerApi

contextBridge.exposeInMainWorld('meowdler', meowdlerApi)
