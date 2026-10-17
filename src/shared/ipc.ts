/**
 * Shared IPC contract between the Electron main process, the preload
 * bridge, and the React renderer.
 *
 * Channels are declared literally so the type checker can catch
 * main/preload/renderer drift at compile time.
 */

/** Every available IPC channel. */
export const IPC_CHANNELS = {
  /** Connection / environment check, invoked by the renderer on startup. */
  appPing: 'app:ping',

  // -- Settings --------------------------------------------------------------
  /** Renderer asks: load persisted settings. */
  settingsGet: 'settings:get',
  /** Renderer asks: validate + persist + return settings. */
  settingsSave: 'settings:save',

  // -- Window controls (frameless titlebar) ------------------------------------
  /** Renderer asks: minimize the window (fire-and-forget). */
  winMinimize: 'win:minimize',
  /** Renderer asks: check GitHub releases for a newer app version. */
  appUpdateCheck: 'app:update-check',
  /** Renderer asks: toggle maximize state (fire-and-forget). */
  winMaximizeToggle: 'win:maximize-toggle',
  /** Renderer asks: is the window currently maximized? */
  winMaximizeGet: 'win:maximize-get',
  /** Renderer asks: close the window (fire-and-forget). */
  winClose: 'win:close',
  /** Main → renderer: maximize state changed (also from OS actions). */
  winMaximizedChanged: 'win:maximized-changed',

  // -- Engine auth (cookies file picker) -----------------------------------------
  /** Renderer asks: open a native file dialog for a cookies.txt file. */
  dialogCookies: 'dialog:cookies',
  /** Renderer asks: validate a cookies.txt path before saving it into settings. */
  appCookiesFileCheck: 'app:cookies-file-check',
  /** Renderer asks: open a native folder dialog for the download folder. */
  dialogDownloadDir: 'dialog:download-dir',
  /** Renderer asks: yt-dlp / ffmpeg versions of the live engine. */
  appEngineInfo: 'app:engine-info',
  /** Renderer asks: a quiet engine (yt-dlp) update check against GitHub. */
  appEngineUpdateCheck: 'app:engine-update-check',
  /** Renderer asks: download + verify + swap in a newer engine build. */
  appEngineUpdateInstall: 'app:engine-update-install',

  // -- Downloads (Phase 2 engine) ------------------------------------------------
  /** Renderer asks: probe a URL and enqueue it for download. */
  downloadSubmit: 'download:submit',
  /** Renderer asks: cheap flat probe for the preview card. */
  downloadPreview: 'download:preview',
  /** Renderer asks: full snapshot of all tracked downloads. */
  downloadList: 'download:list',
  /** Renderer asks: pause a running download. */
  downloadPause: 'download:pause',
  /** Renderer asks: re-queue a paused download. */
  downloadResume: 'download:resume',
  /** Renderer asks: halts + drops a downloading download. */
  downloadCancel: 'download:cancel',
  /** Renderer asks: re-queue a failed download. */
  downloadRetry: 'download:retry',
  /** Renderer asks: forget an item entirely. */
  downloadRemove: 'download:remove',
  /** Renderer asks: reveal the finished file in the file manager. */
  downloadReveal: 'download:reveal',
  /** Renderer asks: open the finished file with the system player. */
  downloadOpen: 'download:open',
  /** Renderer asks: drop every finished/failed/cancelled item. */
  downloadClearHistory: 'download:clear-history',
  /** Main → renderer: a download item snapshot changed (upsert by id). */
  downloadChanged: 'download:changed',
} as const

/** Frozen, exhaustive list of channel names (safe to iterate in main). */
export const ALL_CHANNELS: readonly string[] = Object.values(IPC_CHANNELS)

/** Reply payload for `IPC_CHANNELS.appPing`. */
export interface PingResponse {
  /** App name from package.json productName. */
  appName: string
  /** App version from package.json. */
  appVersion: string
  /** Running Electron runtime version. */
  electronVersion: string
  /** OS platform, e.g. `linux`, `darwin`, `win32`. */
  platform: string
  /** Main-process epoch milliseconds when the handler executed. */
  receivedAt: number
}

/** Payload broadcast on `IPC_CHANNELS.winMaximizedChanged`. */
export type MaximizedPayload = boolean

/** Where the yt-dlp binary in use came from (echoed in Settings). */
export type EngineSource = 'self-updated' | 'bundled' | 'path'

/** Versions of the packaged engine pieces, for the Settings page. */
export interface EngineInfo {
  /** yt-dlp `--version` output; null when the binary could not be run. */
  ytdlpVersion: string | null
  /** ffmpeg first-line version; null when no system ffmpeg exists. */
  ffmpegVersion: string | null
  /** How the yt-dlp binary was resolved (install dir vs updater copy). */
  ytdlpSource: EngineSource
  /**
   * JavaScript runtime yt-dlp uses for YouTube's anti-bot challenges,
   * e.g. "Deno 2.9.7" (bundled) or "Node v24.21.0"; null when none is
   * available, in which case YouTube extraction is expected to fail.
   */
  jsRuntime: string | null
  /** Result of the latest engine-update check; null until one ran. */
  update: EngineUpdateStatus | null
}

/** Last engine-update check, shown in Settings → Engine. */
export interface EngineUpdateStatus {
  checkedAt: number
  latestVersion: string | null
  status: 'up-to-date' | 'available' | 'error'
  /** Error detail when status is 'error'. */
  error: string | null
}

/** Result of an engine-update check / install attempt. */
export interface EngineUpdateOutcome {
  /** up-to-date · available · installed · blocked · error */
  mode: 'up-to-date' | 'available' | 'installed' | 'blocked' | 'error'
  /** Version string of the yt-dlp binary currently resolved. */
  currentVersion: string | null
  /** Latest official release tag, when one was read. */
  latestVersion: string | null
  /** Actionable explanation (e.g. "engine is in use"), null when clean. */
  note: string | null
  /** Technical failure detail, null when clean. */
  error: string | null
}

/** Result of one update check through electron-updater. */
export interface UpdateCheckOutcome {
  mode:
    | 'up-to-date'
    /** A newer GitHub release exists. */
    | 'available'
    /** Running from a format electron-updater cannot install (deb / .tar). */
    | 'unsupported'
    /** Development build (`autoUpdater` is inactive outside packaged apps). */
    | 'dev'
    | 'error'
  currentVersion: string
  latestVersion: string | null
  /** True when the user chose install and the download/relaunch is underway. */
  installing: boolean
  error: string | null
}
