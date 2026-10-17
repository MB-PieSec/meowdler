import type { EngineInfo, EngineUpdateOutcome, PingResponse, UpdateCheckOutcome } from './ipc'
import type {
  DownloadChangedPayload,
  DownloadItem,
  DownloadOptions,
  MediaPreview,
  SubmitResult,
} from './downloads'
import type { AppSettings, CookieFileStatus } from './settings'

/**
 * The public renderer-facing API. Defined here so `preload` can enforce the
 * contract and the renderer can consume the exact same type.
 */
export interface MeowdlerApi {
  /** Verifies the bridge is wired up and reports the runtime environment. */
  ping(): Promise<PingResponse>

  // -- Settings -------------------------------------------------------------

  /** Loads persisted user settings (falls back to defaults on first run). */
  getSettings(): Promise<AppSettings>
  /** Validates, persists, and returns the resulting settings. */
  saveSettings(next: AppSettings): Promise<AppSettings>

  // -- Window controls (frameless titlebar) ----------------------------------

  /** Minimizes the window. */
  minimizeWindow(): void
  /** Maximizes the window, or restores it when already maximized. */
  toggleWindowMaximize(): void
  /** Asks whether the window is currently maximized. */
  isWindowMaximized(): Promise<boolean>
  /**
   * Subscribes to maximize-state changes (also triggered by the OS).
   * Returns an unsubscribe function.
   */
  onWindowMaximizedChange(callback: (maximized: boolean) => void): () => void
  /** Closes the window (quits the app on all platforms except macOS). */
  closeWindow(): void

  // -- Downloads (Phase 2 engine) -----------------------------------------------

  /**
   * Probes `url` and enqueues downloads (one item per video; playlists are
   * expanded). Rejects with a readable message when the URL is invalid or
   * yt-dlp cannot understand it.
   */
  submitDownload(url: string, options?: DownloadOptions): Promise<SubmitResult>
  /** Snapshot of every tracked download (for cold renderer start). */
  listDownloads(): Promise<DownloadItem[]>
  /** Cheap flat probe: preview card for a video or playlist. */
  previewMedia(url: string): Promise<MediaPreview>
  /** Native cookies.txt picker; resolves null when cancelled. */
  pickCookiesFile(): Promise<string | null>
  /** Validates a cookies.txt path (Netscape shape, readable) before saving it. */
  checkCookiesFile(filePath: string): Promise<CookieFileStatus>
  /** Native download-folder picker; resolves null when cancelled. */
  pickDownloadFolder(): Promise<string | null>
  /** yt-dlp / ffmpeg versions of the live engine. */
  engineInfo(): Promise<EngineInfo>
  /**
   * Quiet engine (yt-dlp) update check against official GitHub releases;
   * records the result for `engineInfo().update`.
   */
  checkEngineUpdate(): Promise<EngineUpdateOutcome>
  /**
   * Downloads the newer official engine build, verifies its SHA2-256SUMS
   * hash, and swaps it in atomically inside userData. Blocked (with a
   * readable note) while any download or probe keeps the engine busy.
   */
  installEngineUpdate(): Promise<EngineUpdateOutcome>
  /**
   * Checks GitHub Releases for a newer version. When `prompt` is true and an
   * update exists, main shows the native Install/Not-now dialog and (on
   * consent) downloads + relaunches, or opens the releases page on formats
   * that cannot self-install (deb).
   */
  checkForUpdates(prompt: boolean): Promise<UpdateCheckOutcome>
  /** Halts a running download; .part data is kept for resume. */
  pauseDownload(id: string): void
  /** Re-queues a paused download (concurrency rules apply). */
  resumeDownload(id: string): void
  /** Halts a running download and drops queued work. */
  cancelDownload(id: string): void
  /** Re-queues a failed download. */
  retryDownload(id: string): void
  /** Forgets an item entirely (kills it first when needed). */
  removeDownload(id: string): void
  /** Reveals the finished file in the OS file manager. */
  revealDownload(id: string): void
  /**
   * Opens the finished file with the system default player / application.
   * Resolves `null` on success, or a human-readable failure message.
   */
  openDownload(id: string): Promise<string | null>
  /** Clears every completed/failed/cancelled item (queue + history). */
  clearHistory(): Promise<void>
  /**
   * Subscribes to download snapshot updates. Also fires for items added
   * after the subscription. Returns an unsubscribe function.
   */
  onDownloadChanged(callback: (item: DownloadChangedPayload) => void): () => void
}
