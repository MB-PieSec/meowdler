import { app, shell } from 'electron'
import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_DOWNLOAD_OPTIONS,
  type DownloadItem,
  type DownloadOptions,
  type DownloadState,
  type MediaPreview,
  type QualityPreset,
  type SubmitResult,
} from '../shared/downloads'
import { isFinalHistoryState } from '../shared/downloads'
import { CONCURRENCY_MAX, CONCURRENCY_MIN, DEFAULT_CONCURRENCY } from '../shared/settings'
import {
  cookieArgsFor,
  flatProbeToPreview,
  probeFlat,
  resolveFfmpegBinary,
  resolveYtDlpBinary,
  spawnYtDlpDownload,
} from './ytdlp'
import { loadSettings } from './settings'
import { readHistory, writeHistory } from './history'

/** Guard against pasting a 9000-video channel playlist. */
const MAX_PLAYLIST_ITEMS = 50

/** yt-dlp args implementing one quality preset. */
function formatArgsFor(quality: QualityPreset): string[] {
  switch (quality) {
    case 'best':
      return []
    case 'p1080':
      return ['-f', 'bv*[height<=1080]+ba/b[height<=1080]']
    case 'p720':
      return ['-f', 'bv*[height<=720]+ba/b[height<=720]']
    case 'p480':
      return ['-f', 'bv*[height<=480]+ba/b[height<=480]']
    case 'p360':
      return ['-f', 'bv*[height<=360]+ba/b[height<=360]']
    case 'audio-mp3':
      return ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0']
    case 'audio-m4a':
      return ['-f', 'ba/b', '-x', '--audio-format', 'm4a', '--audio-quality', '0']
  }
}

/**
 * Owns every tracked download: worker pool, lifecycle transitions, and
 * snapshot emission. One instance for the app's lifetime, created in the
 * `whenReady` hook and passed to the IPC layer.
 */

/** Change callback wired up in index.ts to broadcast renderer-side. */
export type OnDownloadChange = (item: DownloadItem) => void

interface ManagedDownload {
  item: DownloadItem
  child: ChildProcess | null
  /** Last yt-dlp stderr ERROR line, surfaced on failure. */
  lastError: string | null
}

export class DownloadError extends Error {}

/**
 * Kills a child gently at first, then for real. yt-dlp keeps its `.part`
 * file intact either way, which is what makes resume possible.
 */
function stopProcess(child: ChildProcess): void {
  child.kill('SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
    }
  }, 2000)
  timer.unref()
}

export class DownloadManager {
  private readonly downloads = new Map<string, ManagedDownload>()
  private readonly emit: OnDownloadChange
  private readonly defaultOutDir: string
  private readonly ytdlpBinary: string

  constructor(emit: OnDownloadChange) {
    this.emit = emit
    this.defaultOutDir = path.join(app.getPath('downloads'), 'Meowdler')
    this.ytdlpBinary = resolveYtDlpBinary()
    // Finished/failed/cancelled items from the previous session rejoin the
    // list (Queue + History views) without touching the worker pool.
    for (const item of readHistory()) {
      this.downloads.set(item.id, { item: { ...item }, child: null, lastError: null })
    }
  }

  /** Effective output dir — the user's override from settings, else default. */
  private outDirFor(): string {
    const configured = loadSettings().downloads.outDir
    return configured ?? this.defaultOutDir
  }

  /** Worker-pool size, clamped to the supported range. */
  private maxConcurrent(): number {
    const raw = loadSettings().downloads.concurrency
    const finite =
      typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : DEFAULT_CONCURRENCY
    return Math.min(Math.max(finite, CONCURRENCY_MIN), CONCURRENCY_MAX)
  }

  /** Full snapshot, newest first (for the cold renderer). */
  list(): DownloadItem[] {
    return [...this.downloads.values()]
      .map((d) => ({ ...d.item }))
      .sort((a, b) => b.queuedAt - a.queuedAt)
  }

  /**
   * Probes the URL, stores a queued item, and kicks the worker pool.
   * Throws {@link DownloadError} with a readable reason on failure.
   */
  /**
   * Probes the URL (flat), expands playlists into one item per video, and
   * joins the worker pool. Throws {@link DownloadError} with a readable
   * reason on failure.
   */
  async submit(url: string, rawOptions?: DownloadOptions): Promise<SubmitResult> {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new DownloadError('That does not look like an http(s) URL')
    }
    const options: DownloadOptions = rawOptions ?? DEFAULT_DOWNLOAD_OPTIONS

    let probe
    try {
      probe = await probeFlat(this.ytdlpBinary, trimmed, cookieArgsFor(loadSettings().cookies))
    } catch (error) {
      throw new DownloadError(error instanceof Error ? error.message : 'Metadata probe failed')
    }

    // Playlist: one queue item per entry (capped); single: exactly one.
    const targets =
      probe.kind === 'playlist'
        ? probe.entries.slice(0, MAX_PLAYLIST_ITEMS)
        : [{ title: probe.title, url: probe.url }]
    const truncatedTo =
      probe.kind === 'playlist' && probe.entries.length > MAX_PLAYLIST_ITEMS
        ? MAX_PLAYLIST_ITEMS
        : null
    if (targets.length === 0) throw new DownloadError('That playlist has no videos')

    const note: string | null =
      probe.kind === 'playlist'
        ? truncatedTo !== null
          ? `Queued the first ${targets.length} of ${probe.entries.length} videos (playlist cap)`
          : `Queued all ${targets.length} videos from this playlist`
        : null

    const items: DownloadItem[] = targets.map((target) => {
      const item: DownloadItem = {
        id: randomUUID(),
        url: target.url,
        state: 'queued',
        title: target.title,
        quality: options.quality,
        outDir: this.outDirFor(),
        filename: null,
        percent: 0,
        downloadedBytes: 0,
        totalBytes: null,
        bytesPerSecond: null,
        etaSeconds: null,
        stage: 'download',
        error: null,
        queuedAt: Date.now(),
        finishedAt: null,
      }
      this.downloads.set(item.id, { item, child: null, lastError: null })
      this.emit({ ...item })
      return item
    })
    this.pump()
    return { items, note }
  }

  /** Halts a running download; the .part file survives for resume. */
  pause(id: string): void {
    this.transition(id, 'paused', (d) => {
      d.item.bytesPerSecond = null
      d.item.etaSeconds = null
      if (d.child !== null) {
        stopProcess(d.child)
        d.child = null
      }
    })
  }

  /** Re-queues a paused download. */
  resume(id: string): void {
    this.transitionTo(id, 'paused', 'queued')
    this.pump()
  }

  /** Re-queues a failed download and clears its error. */
  retry(id: string): void {
    this.transition(id, 'queued', (d) => {
      d.item.error = null
      d.item.percent = 0
    })
    this.writeLedger()
    this.pump()
  }

  /** Halts a running download and marks it cancelled (kept for removal). */
  cancel(id: string): void {
    this.transition(id, 'cancelled', (d) => {
      d.item.finishedAt = Date.now()
      if (d.child !== null) {
        stopProcess(d.child)
        d.child = null
      }
    })
    this.writeLedger()
  }

  /** Forgets an item entirely, killing it first when necessary. */
  remove(id: string): void {
    const d = this.downloads.get(id)
    if (d === undefined) return
    if (d.child !== null) {
      d.item.state = 'cancelled'
      stopProcess(d.child)
      d.child = null
    }
    this.downloads.delete(id)
    this.writeLedger()
  }

  /** Drops every completed/failed/cancelled item and wipes the ledger. */
  clearHistory(): void {
    for (const [id, d] of this.downloads) {
      if (isFinalHistoryState(d.item.state)) this.downloads.delete(id)
    }
    this.writeLedger()
  }

  /** Opens the file manager on the finished output (noop otherwise). */
  reveal(id: string): void {
    const d = this.downloads.get(id)
    if (d === undefined || d.item.filename === null) return
    shell.showItemInFolder(path.join(d.item.outDir, d.item.filename))
  }

  /** Cheap flat probe for the YouTube view's preview card. */
  async preview(url: string): Promise<MediaPreview> {
    const trimmed = url.trim()
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new DownloadError('That does not look like an http(s) URL')
    }
    try {
      return flatProbeToPreview(
        await probeFlat(this.ytdlpBinary, trimmed, cookieArgsFor(loadSettings().cookies)),
      )
    } catch (error) {
      throw new DownloadError(error instanceof Error ? error.message : 'Metadata probe failed')
    }
  }

  // -- internals ------------------------------------------------------------

  /** Re-derives the persisted ledger from live state (newest finish first). */
  private writeLedger(): void {
    const finals = [...this.downloads.values()]
      .map((d) => d.item)
      .filter((item) => isFinalHistoryState(item.state))
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    writeHistory(finals)
  }

  private transition(
    id: string,
    state: DownloadState,
    mutate?: (d: ManagedDownload) => void,
  ): void {
    const d = this.downloads.get(id)
    if (d === undefined) return
    d.item.state = state
    mutate?.(d)
    this.emit({ ...d.item })
  }

  /** Only performs the transition when the current state matches. */
  private transitionTo(id: string, from: DownloadState, to: DownloadState): void {
    const d = this.downloads.get(id)
    if (d === undefined || d.item.state !== from) return
    d.item.state = to
    this.emit({ ...d.item })
  }

  /**
   * Fills free worker slots with queued items. Called after every enqueue,
   * resume, retry, and worker completion so state can never get stuck.
   */
  private pump(): void {
    const dir = this.outDirFor()
    if (fs.existsSync(dir) === false) {
      try {
        fs.mkdirSync(dir, { recursive: true })
      } catch (error) {
        console.error('Could not create the download directory:', error)
      }
    }

    const limit = this.maxConcurrent()
    let active = 0
    for (const d of this.downloads.values()) {
      if (d.item.state === 'downloading') active += 1
    }
    if (active >= limit) return

    for (const d of this.downloads.values()) {
      if (active >= limit) break
      if (d.item.state !== 'queued') continue
      active += 1
      this.start(d)
    }
  }

  private start(d: ManagedDownload): void {
    d.item.state = 'downloading'
    d.item.stage = 'download'
    d.item.error = null
    d.item.bytesPerSecond = null
    d.item.etaSeconds = null
    d.lastError = null
    this.emit({ ...d.item })

    const child = spawnYtDlpDownload({
      binary: this.ytdlpBinary,
      ffmpegBinary: resolveFfmpegBinary(),
      outDir: d.item.outDir,
      url: d.item.url,
      extraArgs: [...formatArgsFor(d.item.quality), ...cookieArgsFor(loadSettings().cookies)],
      handlers: {
        onProgress: (progress) => {
          d.item.percent = progress.percent
          d.item.downloadedBytes = progress.downloadedBytes
          if (progress.totalBytes !== null) d.item.totalBytes = progress.totalBytes
          d.item.bytesPerSecond = progress.bytesPerSecond
          d.item.etaSeconds = progress.etaSeconds
          this.emit({ ...d.item })
        },
        onProcessing: () => {
          d.item.stage = 'processing'
          d.item.percent = 100
          d.item.bytesPerSecond = null
          d.item.etaSeconds = null
          this.emit({ ...d.item })
        },
        onOutputPath: (absolutePath) => {
          d.item.filename = path.basename(absolutePath)
        },
        onError: (message) => {
          d.lastError = message
        },
      },
    })
    d.child = child

    /**
     * Single completion path. Idempotent: intentional stops (paused /
     * cancelled / removed) win over whatever the process did, and a second
     * close event cannot overwrite a finalized state.
     */
    const finish = (successful: boolean): void => {
      d.child = null
      if (
        d.item.state === 'paused' ||
        d.item.state === 'cancelled' ||
        this.downloads.get(d.item.id) === undefined
      ) {
        this.emit({ ...d.item })
        return
      }
      d.item.finishedAt = Date.now()
      if (successful) {
        d.item.state = 'completed'
        d.item.percent = 100
        d.item.stage = 'download'
        d.item.bytesPerSecond = null
        d.item.etaSeconds = null
        d.item.error = null
      } else {
        if (d.item.state !== 'downloading') return
        d.item.state = 'failed'
        d.item.error = d.lastError ?? 'The engine exited unexpectedly (check your connection)'
      }
      this.emit({ ...d.item })
      this.writeLedger()
      this.pump()
    }

    child.on('error', (error: NodeJS.ErrnoException) => {
      d.lastError =
        error.code === 'ENOENT'
          ? 'The yt-dlp engine binary was not found'
          : `Could not launch the engine: ${error.message}`
      finish(false)
    })
    child.on('close', (code) => {
      finish(code === 0)
    })
  }
}
