import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
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
import type { CookieSettings } from '../shared/settings'

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
 * Resolves the bundled binary. Packaged builds ship it next to the app in
 * `resources/`; in development it sits in the repo's `resources/` directory.
 * Falls back to `yt-dlp` on PATH when the bundle is missing.
 */
export function resolveYtDlpBinary(): string {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'yt-dlp')
    : path.join(app.getAppPath(), 'resources', 'yt-dlp')
  if (fs.existsSync(bundled)) return bundled
  return 'yt-dlp'
}

/**
 * ffmpeg, in priority order: bundled (packaged `resources/`), the repo copy
 * under development, then the system binary. yt-dlp only needs the location.
 */
export function resolveFfmpegBinary(): string | null {
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg') : null,
    path.join(app.getAppPath(), 'resources', 'ffmpeg'),
    '/usr/bin/ffmpeg',
  ]
  for (const candidate of candidates) {
    if (candidate !== null && fs.existsSync(candidate)) return candidate
  }
  return null
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
        ...extraArgs,
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
          extractLastError(stderr) ??
            'The engine could not read this URL (unsupported, private, or offline?)',
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
  args.push('-o', path.join(outDir, '%(title)s [%(id)s].%(ext)s'), url)

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
    if (message !== null) handlers.onError(message)
  })

  return child
}

/**
 * Reads yt-dlp and ffmpeg versions for the Settings page. Never throws —
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
    ytdlpBundled: binary !== 'yt-dlp',
  }
}
