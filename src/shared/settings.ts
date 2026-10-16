/**
 * User settings: shaped minimally now (Phase 1 = appearance only) and extended
 * in later phases (download folder, concurrency, engine updates).
 */

/** Every Catppuccin flavor the app ships. */
export const FLAVORS = ['mocha', 'macchiato', 'frappe', 'latte'] as const

export type Flavor = (typeof FLAVORS)[number]

/** Human-readable flavor names for the UI. */
export const FLAVOR_LABELS: Record<Flavor, string> = {
  mocha: 'Mocha',
  macchiato: 'Macchiato',
  frappe: 'Frappé',
  latte: 'Latte',
}

/** Browser cookie stores yt-dlp can read for `--cookies-from-browser`. */
export const COOKIE_BROWSERS = [
  'brave',
  'chrome',
  'chromium',
  'edge',
  'firefox',
  'librewolf',
  'opera',
  'safari',
  'vivaldi',
  'whale',
] as const

export type CookieBrowser = (typeof COOKIE_BROWSERS)[number]

/** How yt-dlp authenticates itself (needed for most Instagram content). */
export interface CookieSettings {
  /** Off, read a Netscape-format file, or read a local browser's store. */
  mode: 'off' | 'file' | 'browser'
  /** Absolute path to a cookies.txt file (mode === 'file'). */
  file: string | null
  /** Which browser's cookie store to use (mode === 'browser'). */
  browser: CookieBrowser | null
}

/** Parallel download limits — the worker pool reads this live. */
export const CONCURRENCY_MIN = 1
export const CONCURRENCY_MAX = 4
export const DEFAULT_CONCURRENCY = 2

/** Download-folder overrides stored alongside the theme. */
export interface DownloadLocationSettings {
  /** Absolute custom output folder; null keeps the platform default. */
  outDir: string | null
  /** How many yt-dlp processes may run at once (1–4). */
  concurrency: number
}

function clampConcurrency(value: unknown): number {
  const raw =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : DEFAULT_CONCURRENCY
  return Math.min(Math.max(raw, CONCURRENCY_MIN), CONCURRENCY_MAX)
}

/** Validates one downloads block; unknown values fall back. */
function parseDownloadLocation(input: unknown): DownloadLocationSettings {
  const raw = input as Record<string, unknown>
  const isAbsolute =
    (typeof raw.outDir === 'string' && raw.outDir.startsWith('/')) ||
    (typeof raw.outDir === 'string' && /^[a-z]:[/\\]/i.test(raw.outDir) === true)
  const outDir =
    typeof raw.outDir === 'string' && isAbsolute && raw.outDir.length > 0 ? raw.outDir : null
  return { outDir, concurrency: clampConcurrency(raw.concurrency) }
}

/** All persisted user settings. */
export interface AppSettings {
  /** Active Catppuccin flavor. */
  flavor: Flavor
  /** Engine authentication (cookies). */
  cookies: CookieSettings
  /** Where finished files land + worker-pool size. */
  downloads: DownloadLocationSettings
}

/** Settings used until a persisted file exists / when values are invalid. */
export const DEFAULT_SETTINGS: AppSettings = {
  flavor: 'mocha',
  cookies: { mode: 'off', file: null, browser: null },
  downloads: { outDir: null, concurrency: DEFAULT_CONCURRENCY },
}

/** Type guard for `Flavor`. */
export function isFlavor(value: unknown): value is Flavor {
  return typeof value === 'string' && (FLAVORS as readonly string[]).includes(value)
}

/**
 * Coerces arbitrary (e.g. JSON) input into valid settings, silently replacing
 * anything unknown with defaults. Prevents malformed files / callers from
 * poisoning the app state.
 */
export function parseSettings(input: unknown): AppSettings {
  if (typeof input !== 'object' || input === null || !('flavor' in input)) {
    return { ...DEFAULT_SETTINGS }
  }
  const raw = input as Record<string, unknown>

  const cookies: CookieSettings =
    typeof raw.cookies === 'object' && raw.cookies !== null
      ? parseCookies(raw.cookies)
      : { ...DEFAULT_SETTINGS.cookies }

  const downloads: DownloadLocationSettings =
    typeof raw.downloads === 'object' && raw.downloads !== null
      ? parseDownloadLocation(raw.downloads)
      : { ...DEFAULT_SETTINGS.downloads }

  return {
    flavor: isFlavor(raw.flavor) ? raw.flavor : DEFAULT_SETTINGS.flavor,
    cookies,
    downloads,
  }
}

/** Validates one cookies block; unknown values fall back to off-mode. */
function parseCookies(input: unknown): CookieSettings {
  const raw = input as Record<string, unknown>
  const mode = raw.mode === 'file' || raw.mode === 'browser' ? raw.mode : 'off'
  const file = typeof raw.file === 'string' && raw.file.length > 0 ? raw.file : null
  const browser =
    typeof raw.browser === 'string' && (COOKIE_BROWSERS as readonly string[]).includes(raw.browser)
      ? (raw.browser as CookieBrowser)
      : null
  return { mode, file, browser }
}
