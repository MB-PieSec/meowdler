import { app } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import {
  extractFilePath,
  extractLastError,
  isProcessingStage,
  isStreamStart,
  parseProgressLine,
  type ProgressInfo,
} from './progress'
import type { MediaPreview } from '../shared/downloads'
import type { EngineInfo } from '../shared/ipc'
import type { CookieFileStatus, CookieSettings } from '../shared/settings'

/**
 * Finds a JavaScript runtime for yt-dlp's EJS engine. Recent yt-dlp releases
 * need one to evaluate YouTube's client-side anti-bot challenges; without it,
 * extraction degrades to "The page needs to be reloaded" / "Sign in to
 * confirm you're not a bot" errors and missing formats — even with valid
 * cookies. Deno is yt-dlp's first-choice runtime (its `--help` lists
 * runtimes "deno, node, quickjs, bun" and only deno is enabled by default),
 * so a per-platform Deno binary ships inside every installer and is probed
 * before any fallback: a userData copy (repairable), then the bundled copy,
 * then Node installs (nvm / nvm-windows / Homebrew / system / PATH) for
 * older setups.
 *
 * Result is cached per process; `null` mean no usable runtime exists and
 * the engine runs degraded — the UI surfaces that in Settings and in
 * download-error hints instead of failing silently.
 */
export interface RuntimeInfo {
  /** Value passed to `--js-runtimes` (`deno:<path>` / `node:<path>`), or null. */
  enabled: string | null
  /** Where the runtime came from. */
  source: 'deno-bundled' | 'deno-user' | 'node' | null
  /** Short human label, e.g. "Deno 2.9.7" / "Node v24.21.0"; null when absent. */
  label: string | null
}

let cachedRuntimeInfo: RuntimeInfo | undefined

function probeRuntime(binary: string): string | null {
  const check = spawnSync(binary, ['--version'], { timeout: 5000, encoding: 'utf8' })
  if (check.status !== 0) return null
  const version = (check.stdout ?? '').split(/\r?\n/)[0]?.trim() ?? ''
  return version.length > 0 ? version : null
}

export function resolveJsRuntimeInfo(): RuntimeInfo {
  if (cachedRuntimeInfo !== undefined) return cachedRuntimeInfo

  const runtimeSuffix = process.platform === 'win32' ? '.exe' : ''
  const denoCandidates: readonly (readonly ['deno-user' | 'deno-bundled', string])[] = [
    ['deno-user', path.join(app.getPath('userData'), 'runtime', `deno${runtimeSuffix}`)],
    [
      'deno-bundled',
      app.isPackaged
        ? path.join(process.resourcesPath, `deno${runtimeSuffix}`)
        : path.join(app.getAppPath(), 'resources', `deno${runtimeSuffix}`),
    ],
  ]

  for (const [source, candidate] of denoCandidates) {
    if (fs.existsSync(candidate) === false) continue
    const version = probeRuntime(candidate)
    if (version === null) continue
    const major = /deno\s+([\d.]+)/.exec(version)?.[1]
    cachedRuntimeInfo = {
      enabled: `deno:${candidate}`,
      source,
      label: major === undefined ? 'Deno' : `Deno ${major}`,
    }
    return cachedRuntimeInfo
  }

  // Node fallbacks for setups predating the bundled Deno. GUI launches don't
  // inherit the shell's PATH, so version managers are searched explicitly.
  const home = app.getPath('home')
  const nodeCandidates: string[] = []
  const push = (candidate: string | undefined): void => {
    if (typeof candidate === 'string' && candidate.length > 0 && fs.existsSync(candidate)) {
      nodeCandidates.push(candidate)
    }
  }
  const nvmUnix = path.join(home, '.nvm', 'versions', 'node')
  try {
    for (const version of fs.readdirSync(nvmUnix)) {
      push(path.join(nvmUnix, version, 'bin', 'node'))
    }
  } catch {
    /* no nvm */
  }
  const nvmWindows =
    process.env.APPDATA === undefined ? null : path.join(process.env.APPDATA, 'nvm')
  if (nvmWindows !== null) {
    try {
      for (const version of fs.readdirSync(nvmWindows)) {
        push(path.join(nvmWindows, version, 'node.exe'))
      }
    } catch {
      /* no nvm-windows */
    }
  }
  push('/usr/bin/node')
  push('/usr/local/bin/node')
  push('/opt/homebrew/bin/node')
  push('C:\\Program Files\\nodejs\\node.exe')
  nodeCandidates.push('node')

  for (const candidate of nodeCandidates) {
    const version = probeRuntime(candidate)
    if (version === null) continue
    cachedRuntimeInfo = { enabled: `node:${candidate}`, source: 'node', label: `Node ${version}` }
    return cachedRuntimeInfo
  }

  cachedRuntimeInfo = { enabled: null, source: null, label: null }
  return cachedRuntimeInfo
}

/** Engine args enabling the JS runtime (empty when none was found). */
export function jsRuntimeArgs(): string[] {
  const runtime = resolveJsRuntimeInfo().enabled
  return runtime === null ? [] : ['--js-runtimes', runtime]
}

/**
 * Rewrites known engine auth walls into actionable hints instead of raw
 * channel-supported errors the user cannot act on. When no JavaScript
 * runtime is available at all, every wall hint mentions it — YouTube fails
 * out of the box in that state, with or without cookies. Signature-style
 * extraction failures ("unable to extract", nsig breaks) typically mean the
 * platform loader moved; the engine receives an update suggestion.
 */
export function withEngineHint(message: string): string {
  const runtimeMissing = resolveJsRuntimeInfo().enabled === null
  const runtimeNote = runtimeMissing
    ? ' (also: the JavaScript runtime that YouTube needs is missing in this install — reinstalling Meowdler restores the bundled Deno)'
    : ''
  if (/sign in to confirm/i.test(message)) {
    return `${message} — Fix: Settings → Cookies → use your browser or a fresh cookies.txt${runtimeNote}`
  }
  if (/needs to be reloaded/i.test(message)) {
    return `${message} — Fix: the engine needs a JavaScript runtime (a Deno copy ships inside the installer; a Node.js install also works)${runtimeNote}`
  }
  if (/unable to extract|nsig extraction failed|no video formats found/i.test(message)) {
    return `${message} — Fix: the platform loader likely changed since this engine build; try Settings → Engine → Check engine updates`
  }
  if (/ffmpeg/i.test(message)) {
    return `${message} — Fix: ffmpeg is missing, so merging and audio extraction cannot run — install it (or reinstall Meowdler; both ship a copy) and retry`
  }
  // Cookie-store failures (mainly browser mode): the quoted paths and
  // browser names are platform-specific, so match loosely.
  if (/could not find \S+ cookies database/i.test(message)) {
    return `${message} — Fix: that browser isn't installed where the engine looks — pick another browser in Settings → Cookies, or switch to a cookies.txt file`
  }
  if (/could not copy .* cookies|database is locked|cookie store is locked/i.test(message)) {
    return `${message} — Fix: that browser seems to be running with a locked cookie store / fresh encryption — close it fully and retry, or use a cookies.txt file in Settings → Cookies`
  }
  // Windows Chromium-family decryption failure (yt-dlp issue #10927): newer
  // Chrome "App-Bound" encryption and broken keyring bindings both land here.
  if (/failed to decrypt with dpapi/i.test(message)) {
    return `${message} — Fix: this Chromium-family browser's cookie encryption cannot be read — close the browser fully and retry; if it still fails, use a cookies.txt export in Settings → Cookies`
  }
  // The engine raises "unsupported platform" only from the Safari cookie
  // reader (cookies.py), so this maps Safari-on-non-mac receipts.
  if (/unsupported platform/i.test(message)) {
    return `${message} — Fix: reading Safari cookies works on macOS only — pick a browser available on this OS, or a cookies.txt file in Settings → Cookies`
  }
  // Cookie-store access denied (TCC on macOS full-disk gating; Unix perms).
  if (/permission denied|operation not permitted/i.test(message)) {
    if (process.platform === 'darwin') {
      return `${message} — Fix: macOS blocked the cookie read — grant Meowdler Full Disk Access (System Settings → Privacy & Security → Full Disk Access → add Meowdler), then retry, or use a cookies.txt file`
    }
    return `${message} — Fix: the cookie store or file cannot be read (permissions) — check the file/browser access, or use a cookies.txt file in Settings → Cookies`
  }
  // Generic wrap yt-dlp raises when nothing above was classified.
  if (/failed to load cookies/i.test(message)) {
    return `${message} — Fix: the engine could not read this cookie source — close the browser fully and retry, or use a cookies.txt file in Settings → Cookies`
  }
  if (/does not look like a Netscape format cookies file/i.test(message)) {
    return `${message} — Fix: re-export a Netscape-format cookies.txt with a “Get cookies.txt” browser extension and pick it again in Settings → Cookies`
  }
  return message
}

/** Reads one binary's first stdout line, with a hard timeout. */
function firstLine(binary: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(binary, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, 5000)
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', () => {
      clearTimeout(timer)
      const line = out.split(/\r?\n/)[0]?.trim()
      resolve(line !== undefined && line.length > 0 ? line : null)
    })
  })
}

/**
 * Thin wrappers around the bundled yt-dlp binary: path resolution, flat
 * metadata probing (single video or playlist), and a spawn helper wired to
 * the progress parsers.
 */

/**
 * Resolves the yt-dlp binary. Priority: a self-updated copy in
 * `userData/runtime/` (written by the engine updater, validated before
 * install), then the bundled copy next to the app in `resources/`
 * (packaged) or the repo's `resources/` (development), finally `yt-dlp` on
 * PATH. No caching — an engine update must take effect on the next spawn.
 */
export function resolveYtDlpBinary(): string {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const names = suffix === '.exe' ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp']
  const dirs = [
    path.join(app.getPath('userData'), 'runtime'),
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    path.join(app.getAppPath(), 'resources'),
  ]
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return 'yt-dlp'
}

/** Where the engine updater installs the self-updated copy. */
export function updatedEngineBinaryPath(): string {
  return path.join(
    app.getPath('userData'),
    'runtime',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  )
}

/** Describes where a resolved engine binary lives (for the Settings row). */
export function engineBinarySource(binary: string): 'self-updated' | 'bundled' | 'path' {
  const runtimeDir = path.dirname(updatedEngineBinaryPath())
  if (path.dirname(binary) === runtimeDir) return 'self-updated'
  if (binary !== 'yt-dlp') return 'bundled'
  return 'path'
}

/**
 * ffmpeg, in priority order: the copy shipped next to the app (packaged
 * `resources/`), the repo copy under development, then conventional install
 * locations on each OS, finally whatever the OS PATH resolves (bare
 * `ffmpeg`; yt-dlp inherits the same environment). Windows also requires the
 * `.exe` extension — an extensionless copy cannot be executed there.
 */
export function resolveFfmpegBinary(): string | null {
  const suffixes = process.platform === 'win32' ? ['.exe'] : ['']
  const packageDir = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources')
  const dirs = [
    packageDir,
    path.join(app.getAppPath(), 'resources'),
    '/usr/bin',
    '/usr/local/bin',
    '/opt/homebrew/bin',
  ]
  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `ffmpeg${suffix}`)
      if (fs.existsSync(candidate)) return candidate
    }
  }
  // PATH fallback: a quick executable probe, same environment yt-dlp gets.
  const probe = spawnSync('ffmpeg', ['-version'], { timeout: 5000, stdio: 'ignore' })
  return probe.status === 0 ? 'ffmpeg' : null
}

const PROBE_TIMEOUT_MS = 30_000

export interface PlaylistEntryProbe {
  title: string
  /** Best available URL for an individual playlist item. */
  url: string
}

/** Result of the cheap `--flat-playlist` probe. */
export interface FlatProbe {
  kind: 'single' | 'playlist'
  title: string
  uploader: string | null
  thumbnail: string | null
  durationSeconds: number | null
  /** Canonical URL resolved by the extractor (fallback: the input url). */
  url: string
  /** Direct entry list (playlists only). */
  entries: PlaylistEntryProbe[]
}

/** Reads a thumbnail URL out of yt-dlp's thumbnail arrays when present. */
function asRecordArray(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value) === false) return []
  return value as readonly Record<string, unknown>[]
}

function readThumbnail(
  json: Record<string, unknown>,
  safeEntries: readonly Record<string, unknown>[] = [],
): string | null {
  const direct = json.thumbnail
  if (typeof direct === 'string' && direct.startsWith('http')) return direct

  for (const item of [...asRecordArray(json.thumbnails)].reverse()) {
    const url = item.url
    if (typeof url === 'string' && url.startsWith('http')) return url
  }

  const firstThumbnail = safeEntries[0]?.thumbnail
  if (typeof firstThumbnail === 'string' && firstThumbnail.startsWith('http')) {
    return firstThumbnail
  }
  return null
}

function readEntryUrl(entry: Record<string, unknown>, fallbackId: string): string {
  const webpage = entry.webpage_url
  if (typeof webpage === 'string' && webpage.length > 0) return webpage
  const direct = entry.url
  if (typeof direct === 'string' && direct.length > 0 && /^https?:\/\//i.test(direct)) {
    return direct
  }
  if (typeof direct === 'string' && direct.length > 0 && !direct.includes('/')) {
    // Bare ids common for youtube entries.
    return `https://www.youtube.com/watch?v=${direct}`
  }
  if (typeof fallbackId === 'string' && fallbackId.length > 0) {
    return `https://www.youtube.com/watch?v=${fallbackId}`
  }
  return ''
}

function safeTitle(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'Download'
}

/** Translates persisted cookie settings into yt-dlp args. */
export function cookieArgsFor(cards: CookieSettings): string[] {
  switch (cards.mode) {
    case 'off':
      return []
    case 'file':
      return cards.file === null ? [] : ['--cookies', cards.file]
    case 'browser':
      return cards.browser === null ? [] : ['--cookies-from-browser', cards.browser]
  }
}

/**
 * Validates one cookies.txt before it reaches the engine. The engine
 * silently ignores missing and unreadable files (downloads just proceed
 * without cookies), so file-mode problems must be caught app-side.
 * Accepts what yt-dlp accepts: a `# Netscape` header, or any data line
 * with the seven tab-separated cookie fields.
 */
export function validateCookieFile(filePath: string): CookieFileStatus {
  let stats: fs.Stats
  try {
    stats = fs.statSync(filePath)
  } catch {
    return { status: 'missing' }
  }
  if (!stats.isFile()) return { status: 'missing' }
  let head: string
  try {
    const handle = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(65536)
      const read = fs.readSync(handle, buffer, 0, buffer.length, 0)
      head = buffer.subarray(0, read).toString('utf8')
    } finally {
      fs.closeSync(handle)
    }
  } catch {
    return { status: 'unreadable' }
  }
  for (const line of head.split(/\r?\n/)) {
    if (line.startsWith('# Netscape HTTP Cookie File')) return { status: 'ok' }
    if (line.split('\t').length === 7 && line.trim().length > 0) return { status: 'ok' }
  }
  return { status: 'format' }
}

/**
 * Cookie args with pre-spawn validation. Throws a user-actionable error
 * instead of silently downloading without cookies when file mode is
 * broken; browser mode stays pass-through (the engine's own stderr is
 * mapped into hints there — its search paths are platform-specific).
 */
export function resolveCookieArgs(cards: CookieSettings): string[] {
  if (cards.mode === 'file' && cards.file !== null) {
    const status = validateCookieFile(cards.file).status
    if (status === 'missing') {
      throw new Error(
        'The chosen cookies file is gone or unreadable — pick it again in Settings → Cookies',
      )
    }
    if (status === 'unreadable') {
      throw new Error(
        'The chosen cookies file cannot be read (permissions?) — re-save or re-pick it in Settings → Cookies',
      )
    }
    if (status === 'format') {
      throw new Error(
        'The chosen cookies file is not in Netscape format — re-export it with a “Get cookies.txt” extension (Settings → Cookies)',
      )
    }
  }
  if (cards.mode === 'file' && cards.file === null) {
    throw new Error('Cookies are set to file mode, but no file is chosen — Settings → Cookies')
  }
  if (cards.mode === 'browser' && cards.browser === null) {
    throw new Error(
      'Cookies are set to browser mode, but no browser is chosen — Settings → Cookies',
    )
  }
  return cookieArgsFor(cards)
}

/**
 * Probes a URL with `--flat-playlist --dump-single-json`. Single videos come
 * back complete; playlists return flat entries (no per-video network cost).
 * `--no-playlist` keeps links-to-playlists inside watch pages as one video.
 */
export function probeFlat(
  binary: string,
  url: string,
  extraArgs: readonly string[] = [],
): Promise<FlatProbe> {
  return new Promise<FlatProbe>((resolve, reject) => {
    const child: ChildProcess = spawn(
      binary,
      [
        '--flat-playlist',
        '--dump-single-json',
        '--no-playlist',
        '--no-warnings',
        '--skip-download',
        ...jsRuntimeArgs(),
        ...extraArgs,
        // `--` ends option parsing so a URL can never be read as a flag.
        '--',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('Timed out while reading metadata for this URL'))
    }, PROBE_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        new Error(
          error.code === 'ENOENT'
            ? 'The yt-dlp engine binary was not found'
            : `Could not launch the yt-dlp engine: ${error.message}`,
        ),
      )
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && stdout.trim().length > 0) {
        try {
          const json = JSON.parse(stdout) as Record<string, unknown>
          const isPlaylist = json._type === 'playlist'

          if (!isPlaylist) {
            resolve({
              kind: 'single',
              title: safeTitle(json.title),
              uploader:
                typeof json.uploader === 'string'
                  ? json.uploader
                  : typeof json.channel === 'string'
                    ? json.channel
                    : null,
              thumbnail: readThumbnail(json),
              durationSeconds: typeof json.duration === 'number' ? json.duration : null,
              url: typeof json.webpage_url === 'string' ? json.webpage_url : url,
              entries: [],
            })
            return
          }

          const safeEntries = asRecordArray(json.entries)
          const entries: PlaylistEntryProbe[] = []
          for (const entry of safeEntries) {
            const id = typeof entry.id === 'string' ? entry.id : ''
            const entryUrl = readEntryUrl(entry, id)
            if (entryUrl === '') continue
            entries.push({ title: safeTitle(entry.title), url: entryUrl })
          }

          resolve({
            kind: 'playlist',
            title: safeTitle(json.title),
            uploader: typeof json.uploader === 'string' ? json.uploader : null,
            thumbnail: readThumbnail(json, asRecordArray(json.entries)),
            durationSeconds: null,
            url: typeof json.webpage_url === 'string' ? json.webpage_url : url,
            entries,
          })
        } catch {
          reject(new Error('Received unreadable metadata from the engine'))
        }
        return
      }
      reject(
        new Error(
          withEngineHint(
            extractLastError(stderr) ??
              'The engine could not read this URL (unsupported, private, or offline?)',
          ),
        ),
      )
    })
  })
}

/** Maps a flat probe onto the shared preview-card shape. */
export function flatProbeToPreview(probe: FlatProbe): MediaPreview {
  return {
    kind: probe.kind,
    title: probe.title,
    uploader: probe.uploader,
    thumbnail: probe.thumbnail,
    durationSeconds: probe.durationSeconds,
    entryCount: probe.kind === 'playlist' ? probe.entries.length : 1,
    url: probe.url,
  }
}

/** Callbacks for a spawned download. */
export interface DownloadHandlers {
  onProgress: (progress: ProgressInfo) => void
  /** Fired when the item enters a post-download ffmpeg stage. */
  onProcessing: () => void
  /** Fired when a new format stream begins (yt-dlp restarts its counters). */
  onStreamStart: () => void
  /** Best-known final output path (upgraded as better lines arrive). */
  onOutputPath: (absolutePath: string) => void
  /** Last yt-dlp ERROR line, for failure reporting. */
  onError: (message: string) => void
}

/**
 * Spawns yt-dlp for one download. Emits parsed progress per `--newline`
 * tick; ignores benign warnings. `extraArgs` carries the quality preset's
 * format selectors / audio extraction flags. Returns the child for
 * lifecycle control.
 */
export function spawnYtDlpDownload(options: {
  binary: string
  ffmpegBinary: string | null
  outDir: string
  url: string
  extraArgs: readonly string[]
  handlers: DownloadHandlers
}): ChildProcess {
  const { binary, ffmpegBinary, outDir, url, extraArgs, handlers } = options

  const args = [
    '--newline',
    '--progress',
    '--no-warnings',
    '--no-playlist',
    '--no-mtime',
    '--no-overwrites',
    '--merge-output-format',
    'mp4',
    ...extraArgs,
  ]
  if (ffmpegBinary !== null) {
    args.push('--ffmpeg-location', ffmpegBinary)
  }
  args.push(...jsRuntimeArgs())
  // `--` ends option parsing so a URL can never be read as a flag.
  args.push('-o', path.join(outDir, '%(title)s [%(id)s].%(ext)s'), '--', url)

  const child: ChildProcess = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout?.setEncoding('utf8')

  /** Line accumulation: `--newline` ends lines with \n/\r both ways. */
  let partial = ''
  child.stdout?.on('data', (chunk: string) => {
    partial += chunk
    const lines = partial.split(/\r\n|\n|\r/)
    partial = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (isProcessingStage(trimmed)) handlers.onProcessing()
      if (isStreamStart(trimmed)) handlers.onStreamStart()
      const filePath = extractFilePath(trimmed)
      if (filePath !== null) handlers.onOutputPath(filePath)
      const progress = parseProgressLine(trimmed)
      if (progress !== null) handlers.onProgress(progress)
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    const message = extractLastError(chunk.toString('utf8'))
    if (message !== null) handlers.onError(withEngineHint(message))
  })

  return child
}

/** Reads yt-dlp and ffmpeg versions for the Settings page. Never throws —
 * any failure means `null` for that piece.
 */
export async function readEngineVersions(): Promise<EngineInfo> {
  const binary = resolveYtDlpBinary()
  const ffmpeg = resolveFfmpegBinary()
  const [ytdlpVersion, ffmpegLine] = await Promise.all([
    firstLine(binary, ['--version']),
    ffmpeg === null ? Promise.resolve(null) : firstLine(ffmpeg, ['-version']),
  ])
  const ffmpegVersion =
    ffmpegLine === null ? null : (/version\s+\S+/.exec(ffmpegLine)?.[0] ?? ffmpegLine)
  return {
    ytdlpVersion,
    ffmpegVersion,
    ytdlpSource: engineBinarySource(binary),
    jsRuntime: resolveJsRuntimeInfo().label,
    update: null, // merged in by the IPC layer from the updater's cache
  }
}
