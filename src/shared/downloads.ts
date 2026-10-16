/**
 * Shared types for the download pipeline (Phase 2).
 * Read by main, preload, and the renderer.
 */

/** Lifecycle of a single download. */
export type DownloadState =
  /** Waiting for a worker slot. */
  | 'queued'
  /** yt-dlp is running. */
  | 'downloading'
  /** Killed deliberately; .part data is kept so resume continues it. */
  | 'paused'
  /** yt-dlp exited 0 and the file exists. */
  | 'completed'
  /** yt-dlp exited non-zero (or could not launch). */
  | 'failed'
  /** Killed deliberately and forgotten (kept only until removed). */
  | 'cancelled'

/**
 * Quality presets. Video caps use the `bv*[height<=N]+ba/b[height<=N]`
 * format string (falls back to a single combined format); audio presets
 * use bestaudio + ffmpeg extraction.
 */
export type QualityPreset = 'best' | 'p1080' | 'p720' | 'p480' | 'p360' | 'audio-mp3' | 'audio-m4a'

/** Per-download user options (attached at queue time). */
export interface DownloadOptions {
  quality: QualityPreset
}

/** Validated defaults — used when the renderer sends nothing. */
export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = { quality: 'p1080' }

/** Validates one preset; used by options parsing and history parsing. */
export function isQualityPreset(value: unknown): value is QualityPreset {
  return (
    value === 'best' ||
    value === 'p1080' ||
    value === 'p720' ||
    value === 'p480' ||
    value === 'p360' ||
    value === 'audio-mp3' ||
    value === 'audio-m4a'
  )
}

/** Coerces wire input into valid options; unknown shapes fall back to defaults. */
export function parseDownloadOptions(input: unknown): DownloadOptions {
  if (typeof input === 'object' && input !== null && 'quality' in input) {
    const { quality } = input as Record<string, unknown>
    if (isQualityPreset(quality)) return { quality }
  }
  return { ...DEFAULT_DOWNLOAD_OPTIONS }
}

/** Full snapshot of one download item; the only shape sent over IPC. */
export interface DownloadItem {
  /** Runtime-unique id (UUID, generated in main). */
  id: string
  url: string
  state: DownloadState
  /** Title from yt-dlp metadata; null when the probe is still running. */
  title: string | null
  /** Quality preset chosen when queued. */
  quality: QualityPreset
  /** Absolute directory the finished file is written to. */
  outDir: string
  /** Final output basename (yt-dlp Destination/Merger lines); null until known. */
  filename: string | null
  /** 0–100; stays 0 while unknown. */
  percent: number
  /** Approximate (derived from percent × total) when total is unknown. */
  downloadedBytes: number
  totalBytes: number | null
  bytesPerSecond: number | null
  etaSeconds: number | null
  /** 'download' while fetching; 'processing' during ffmpeg merge/mux. */
  stage: 'download' | 'processing'
  /** Human-readable failure reason; null when healthy. */
  error: string | null
  queuedAt: number
  finishedAt: number | null
}

/** What `download:submit` resolves with. */
export interface SubmitResult {
  /** Every queue item created by this call (one per video). */
  items: DownloadItem[]
  /** Human-readable queue summary for toasts (caps, playlist counts); null for plain single adds. */
  note: string | null
}

/**
 * Preview card data for the YouTube-style view. Playlists report their
 * entry count and a thumbnail; single videos report duration and uploader.
 */
export interface MediaPreview {
  kind: 'single' | 'playlist'
  title: string
  uploader: string | null
  /** Remote image URL (https) or null. */
  thumbnail: string | null
  durationSeconds: number | null
  /** Number of videos in the playlist (single videos: 1). */
  entryCount: number
  /** Canonical URL yt-dlp resolved. */
  url: string
}

/** Broadcast payload for `IPC_CHANNELS.downloadChanged`. */
export type DownloadChangedPayload = DownloadItem

/** The states that survive app restarts in the history ledger. */
export const FINAL_HISTORY_STATES = ['completed', 'failed', 'cancelled'] as const

/** `true` only for states that belong in the persisted history. */
export function isFinalHistoryState(state: DownloadState): boolean {
  return (FINAL_HISTORY_STATES as readonly string[]).includes(state)
}

/**
 * Platform badge for a media URL (`history` rows and queue items show this
 * next to the state chip). Recognizes the three supported platforms and
 * falls back to a generic label for anything else yt-dlp handles.
 */
export function sourceOfUrl(url: string): string {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'Web'
  }
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return 'YouTube'
  if (/(^|\.)(x\.com|twitter\.com|twimg\.com)$/.test(host)) return 'X'
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram'
  return 'Web'
}

/* Consistent coercion helpers for the strict ledger parser. */
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
function asOptString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function asOptNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Strictly validates one persisted download snapshot. Returns null for
 * anything malformed/unfinalized — a corrupt ledger line is skipped, never
 * allowed to break the list.
 */
export function parseDownloadItem(input: unknown): DownloadItem | null {
  if (typeof input !== 'object' || input === null) return null
  const raw = input as Record<string, unknown>

  const state = asString(raw.state)
  const id = asString(raw.id)
  const url = asString(raw.url)
  const outDir = asString(raw.outDir)
  if (id === '' || url === '' || outDir === '' || !isFinalHistoryState(state as DownloadState)) {
    return null
  }

  return {
    id,
    url,
    state: state as DownloadItem['state'],
    title: asOptString(raw.title),
    quality: isQualityPreset(raw.quality) ? raw.quality : 'best',
    outDir,
    filename: asOptString(raw.filename),
    percent: asNumber(raw.percent),
    downloadedBytes: asNumber(raw.downloadedBytes),
    totalBytes: asOptNumber(raw.totalBytes),
    bytesPerSecond: asOptNumber(raw.bytesPerSecond),
    etaSeconds: asOptNumber(raw.etaSeconds),
    stage: raw.stage === 'processing' ? 'processing' : 'download',
    error: asOptString(raw.error),
    queuedAt: asNumber(raw.queuedAt),
    finishedAt: asOptNumber(raw.finishedAt),
  }
}

/** Validates a full ledger file (array). Corrupt entries are skipped. */
export function parseHistoryEntries(input: unknown): DownloadItem[] {
  if (Array.isArray(input) === false) return []
  const seen = new Set<string>()
  const result: DownloadItem[] = []
  for (const raw of input) {
    const item = parseDownloadItem(raw)
    if (item === null || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}
