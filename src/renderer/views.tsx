import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { EngineInfo, PingResponse } from '../shared/ipc'
import type { DownloadItem, DownloadState, MediaPreview, QualityPreset } from '../shared/downloads'
import { isFinalHistoryState, sourceOfUrl } from '../shared/downloads'
import {
  COOKIE_BROWSERS,
  FLAVOR_LABELS,
  FLAVORS,
  type CookieBrowser,
  type CookieSettings,
  type DownloadLocationSettings,
  type Flavor,
} from '../shared/settings'
import { Button, Chip, Entry, ProgressBar } from './components/ui'
import { useToast } from './components/toast'
import { useSettings } from './hooks/useSettings'
import { errorText, useDownloads } from './hooks/useDownloads'
import { IconInstagram, IconX, IconYoutube } from './components/icons'

/**
 * View definitions and implementations.
 *
 * Live now: Home, the YouTube / X / Instagram tabs, the Queue with search +
 * filters, the persistent History, and Settings (theme + cookies).
 */

export type ViewId = 'home' | 'youtube' | 'twitter' | 'instagram' | 'queue' | 'history' | 'settings'

/** Props every view component may receive. */
export interface ViewProps {
  /** Sidebar navigation from inside a view (e.g. Home platform cards). */
  navigate: (id: ViewId) => void
}

export interface ViewDef {
  Component: (props: ViewProps) => JSX.Element
  id: ViewId
  label: string
  heading: string
  blurb: string
}

// -- Home -----------------------------------------------------------------------

export function HomeView({ navigate }: ViewProps): JSX.Element {
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.meowdler
      .ping()
      .then(setPing)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
  }, [])

  return (
    <>
      <section className="card">
        <h2 className="card-title">Supported platforms</h2>
        <div className="platform-grid">
          <button
            className="platform-card"
            onClick={() => navigate('youtube')}
            title="Open the YouTube tab"
            type="button"
          >
            <span className="platform-icon" style={{ color: 'var(--danger)' }}>
              <IconYoutube size={22} />
            </span>
            <div>
              <div className="platform-name">YouTube</div>
              <div className="platform-desc">Videos · playlists · audio-only</div>
            </div>
            <div className="chip-spacer" />
            <Chip tone="accent">available</Chip>
          </button>
          <button
            className="platform-card"
            onClick={() => navigate('twitter')}
            title="Open the X tab"
            type="button"
          >
            <span className="platform-icon" style={{ color: 'var(--accent)' }}>
              <IconX size={20} />
            </span>
            <div>
              <div className="platform-name">X (Twitter)</div>
              <div className="platform-desc">Posts · threads · original quality</div>
            </div>
            <div className="chip-spacer" />
            <Chip tone="accent">available</Chip>
          </button>
          <button
            className="platform-card"
            onClick={() => navigate('instagram')}
            title="Open the Instagram tab"
            type="button"
          >
            <span className="platform-icon" style={{ color: 'var(--warning)' }}>
              <IconInstagram size={21} />
            </span>
            <div>
              <div className="platform-name">Instagram</div>
              <div className="platform-desc">Posts · Reels · Stories via own session</div>
            </div>
            <div className="chip-spacer" />
            <Chip tone="accent">available</Chip>
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Connection check</h2>
        {error !== null && <p className="card-text error">IPC ping failed: {error}</p>}
        {ping !== null ? (
          <ul className="check-list">
            <li>
              <span className="key">App</span>
              <span className="value">
                {ping.appName} v{ping.appVersion}
              </span>
            </li>
            <li>
              <span className="key">Electron</span>
              <span className="value">{ping.electronVersion}</span>
            </li>
            <li>
              <span className="key">Platform</span>
              <span className="value">{ping.platform}</span>
            </li>
            <li>
              <span className="key">Bridge</span>
              <span className="value ok">connected</span>
            </li>
          </ul>
        ) : error === null ? (
          <p className="card-text">Pinging…</p>
        ) : null}
      </section>
    </>
  )
}

// -- Settings (theme · cookie auth · download folder · concurrency · engine info) ---

function FlavorTile({
  flavor,
  picked,
  onPick,
}: {
  flavor: Flavor
  picked: boolean
  onPick: () => void
}): JSX.Element {
  return (
    <button
      className={`flavor-tile${picked ? ' active' : ''}`}
      onClick={onPick}
      role="radio"
      type="button"
    >
      <span className="flavor-swatch" data-flavor={flavor} />
      {FLAVOR_LABELS[flavor]}
    </button>
  )
}

export function SettingsView(): JSX.Element {
  const { loaded, settings, saveSettings } = useSettings()
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const toast = useToast()

  const pick = (flavor: Flavor): void => {
    void saveSettings({ ...settings, flavor })
    toast(`${FLAVOR_LABELS[flavor]} theme applied`, 'success')
  }

  const saveCookies = (patch: Partial<CookieSettings>): void => {
    void saveSettings({ ...settings, cookies: { ...settings.cookies, ...patch } })
  }

  const saveDownloads = (patch: Partial<DownloadLocationSettings>): void => {
    void saveSettings({ ...settings, downloads: { ...settings.downloads, ...patch } })
  }

  const chooseFolder = (): void => {
    void window.meowdler
      .pickDownloadFolder()
      .then((folder) => {
        if (folder === null) return
        saveDownloads({ outDir: folder })
        toast(`Downloads now land in ${folder}`, 'success')
      })
      .catch((error: unknown) => {
        toast(errorText(error), 'danger')
      })
  }

  useEffect(() => {
    let mounted = true
    void window.meowdler
      .engineInfo()
      .then((info) => {
        if (mounted) setEngine(info)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const chooseCookiesFile = (): void => {
    void window.meowdler
      .pickCookiesFile()
      .then((file) => {
        if (file === null) return
        saveCookies({ mode: 'file', file })
        toast('Cookies file set', 'success')
      })
      .catch((error: unknown) => {
        toast(errorText(error), 'danger')
      })
  }

  return (
    <>
      <section className="card">
        <h2 className="card-title">Appearance</h2>
        <p className="card-text muted">
          Pick a Catppuccin flavor — applied instantly and persisted.
        </p>
        <div className="flavor-tiles" role="radiogroup" aria-label="Catppuccin flavor">
          {FLAVORS.map((option) => (
            <FlavorTile
              flavor={option}
              key={option}
              onPick={() => pick(option)}
              picked={loaded && settings.flavor === option}
            />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Cookies</h2>
        <p className="card-text muted">
          Most Instagram content (and some X posts) needs a login for the engine to see it. Export
          your cookies with a “Get cookies.txt” browser extension, or let the engine read a local
          browser's store directly. Cookies stay on this machine.
        </p>
        <div className="yt-form">
          <select
            className="select"
            onChange={(event) => {
              const mode = event.target.value as CookieSettings['mode']
              if (mode === 'off') {
                saveCookies({ mode, file: null, browser: null })
                toast('Cookies off', 'info')
                return
              }
              if (mode === 'file' && settings.cookies.file !== null) {
                saveCookies({ mode })
                toast('Using the chosen cookies file', 'success')
                return
              }
              if (mode === 'browser' && settings.cookies.browser !== null) {
                saveCookies({ mode })
                toast('Reading cookies from that browser', 'success')
                return
              }
              saveCookies({ mode })
            }}
            value={settings.cookies.mode}
          >
            <option value="off">No cookies</option>
            <option value="file">From a cookies.txt file</option>
            <option value="browser">From an installed browser</option>
          </select>

          {settings.cookies.mode === 'file' ? (
            <div className="yt-actions">
              <div className="cookie-path" title={settings.cookies.file ?? undefined}>
                {settings.cookies.file ?? 'No file chosen yet'}
              </div>
              <Button onClick={chooseCookiesFile} small>
                Choose cookies file…
              </Button>
            </div>
          ) : null}

          {settings.cookies.mode === 'browser' ? (
            <label className="yt-actions" htmlFor="cookie-browser">
              <span className="select-label">Browser</span>
              <select
                className="select"
                id="cookie-browser"
                onChange={(event) => {
                  const browser = event.target.value as CookieBrowser
                  saveCookies({ browser })
                  toast(`Reading cookies from ${BROWSER_LABELS[browser]}`, 'success')
                }}
                value={settings.cookies.browser ?? 'firefox'}
              >
                {COOKIE_BROWSERS.map((browser) => (
                  <option key={browser} value={browser}>
                    {BROWSER_LABELS[browser]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Downloads</h2>
        <div className="set-line">
          <div className="set-info">
            <div className="set-name">Download folder</div>
            <div className="preview-meta">
              {settings.downloads.outDir ?? 'Default — system Downloads / Meowdler'}
            </div>
          </div>
          <div className="history-actions">
            <Button onClick={chooseFolder} small>
              Choose folder…
            </Button>
            {settings.downloads.outDir !== null ? (
              <Button
                onClick={() => {
                  saveDownloads({ outDir: null })
                  toast('Back to the default folder', 'info')
                }}
                small
                variant="ghost"
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>
        <div className="set-line">
          <div className="set-info">
            <div className="set-name">Concurrency</div>
            <div className="preview-meta">Downloads running at the same time.</div>
          </div>
          <select
            className="select"
            onChange={(event) => {
              const next = Number(event.target.value)
              saveDownloads({ concurrency: next })
              toast(`Up to ${next} downloads at once`, 'success')
            }}
            value={settings.downloads.concurrency}
          >
            {[1, 2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Engine</h2>
        <div className="set-line">
          <div className="set-info">
            <div className="set-name">yt-dlp</div>
            <div className="preview-meta">
              {engine === null
                ? 'Reading…'
                : (engine.ytdlpVersion ?? 'unavailable') +
                  ` · ${engine.ytdlpBundled ? 'bundled with Meowdler' : 'from PATH'}`}
            </div>
          </div>
        </div>
        <div className="set-line">
          <div className="set-info">
            <div className="set-name">ffmpeg</div>
            <div className="preview-meta">
              {engine === null
                ? 'Reading…'
                : (engine.ffmpegVersion ?? 'not found — merging unavailable')}
            </div>
          </div>
        </div>
        <p className="card-text muted">
          Engine fixes ship with Meowdler updates; the platform loaders change constantly.
        </p>
      </section>
    </>
  )
}

// -- Media form (shared by the YouTube and X tabs) -------------------------------------

/** Pretty names for the cookie-source browser list. */
const BROWSER_LABELS: Record<CookieBrowser, string> = {
  brave: 'Brave',
  chrome: 'Chrome',
  chromium: 'Chromium',
  edge: 'Edge',
  firefox: 'Firefox',
  librewolf: 'LibreWolf',
  opera: 'Opera',
  safari: 'Safari',
  vivaldi: 'Vivaldi',
  whale: 'Whale',
}

/** Labels for the quality preset select + queue badge. */
const PRESET_LABEL: Record<QualityPreset, string> = {
  best: 'Best quality',
  p1080: '1080p',
  p720: '720p',
  p480: '480p',
  p360: '360p',
  'audio-mp3': 'Audio only · MP3',
  'audio-m4a': 'Audio only · M4A',
}

const ALL_PRESETS: readonly QualityPreset[] = [
  'best',
  'p1080',
  'p720',
  'p480',
  'p360',
  'audio-mp3',
  'audio-m4a',
]

/** X rarely exceeds 720p; that's the honest menu for tweets. */
const X_PRESET_ORDER: readonly QualityPreset[] = ['best', 'p720', 'p480', 'audio-mp3', 'audio-m4a']

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null
  const text = formatEta(seconds)
  return text === null ? null : `${text} long`
}

interface MediaFormProps {
  heading: string
  placeholder: string
  presets: readonly QualityPreset[]
  defaultPreset: QualityPreset
  /** Platform-specific error translation (e.g. Instagram cookie hint). */
  explain?: (message: string) => string
}

/**
 * The paste-URL card shared by platform tabs: thumbnail preview, quality
 * select, download. Playlist-style links (multi-video posts included)
 * expand into individual queue items.
 */
function MediaFormCard({
  heading,
  placeholder,
  presets,
  defaultPreset,
  explain,
}: MediaFormProps): JSX.Element {
  const { add } = useDownloads()
  const [url, setUrl] = useState('')
  const [quality, setQuality] = useState<QualityPreset>(defaultPreset)
  const [preview, setPreview] = useState<MediaPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const message = (error: unknown): string => {
    const text = errorText(error)
    return explain === undefined ? text : explain(text)
  }

  const runPreview = (): void => {
    if (busy || url.trim() === '') return
    setBusy(true)
    window.meowdler
      .previewMedia(url)
      .then(setPreview)
      .catch((error: unknown) => {
        setPreview(null)
        toast(message(error), 'danger')
      })
      .finally(() => setBusy(false))
  }

  const download = (): void => {
    if (busy || url.trim() === '') return
    setBusy(true)
    add(url, { quality })
      .then((result) => {
        setUrl('')
        setPreview(null)
        toast(result.note ?? 'Added to the queue', 'success')
      })
      .catch((error: unknown) => {
        toast(message(error), 'danger')
      })
      .finally(() => setBusy(false))
  }

  return (
    <>
      <section className="card">
        <h2 className="card-title">{heading}</h2>
        <div className="yt-form">
          <Entry
            disabled={busy}
            onChange={setUrl}
            onSubmit={runPreview}
            placeholder={placeholder}
            value={url}
          />
          <div className="yt-actions">
            <select
              className="select"
              onChange={(event) => setQuality(event.target.value as QualityPreset)}
              value={quality}
            >
              {presets.map((preset) => (
                <option key={preset} value={preset}>
                  {PRESET_LABEL[preset]}
                </option>
              ))}
            </select>
            <div className="yt-buttons">
              <Button onClick={runPreview} small variant="ghost">
                {busy ? '…' : 'Preview'}
              </Button>
              <Button disabled={url.trim().length === 0} onClick={download} small>
                Download
              </Button>
            </div>
          </div>
        </div>
      </section>

      {preview !== null ? (
        <section className="card preview-card">
          <div className="preview-body">
            {preview.thumbnail !== null ? (
              // Remote https thumbnails from the platform CDN.
              <img alt="" className="preview-thumb" draggable={false} src={preview.thumbnail} />
            ) : null}
            <div className="preview-info">
              <div className="preview-title">{preview.title}</div>
              {preview.uploader !== null ? (
                <div className="preview-meta">{preview.uploader}</div>
              ) : null}
              <div className="preview-meta">
                {preview.kind === 'playlist'
                  ? `${preview.entryCount} videos`
                  : formatDuration(preview.durationSeconds)}
              </div>
              <Chip tone="accent">{preview.kind === 'playlist' ? 'Playlist' : 'Video'}</Chip>
            </div>
          </div>
          <div className="preview-footer">
            <Button onClick={download} small>
              Download
            </Button>
          </div>
        </section>
      ) : null}
    </>
  )
}

/** The YouTube tab: videos, playlists, quality presets, audio extraction. */
export function YouTubeView(): JSX.Element {
  return (
    <MediaFormCard
      defaultPreset="p1080"
      heading="Video or playlist URL"
      placeholder="https://www.youtube.com/watch?v=… · /playlist?list=…"
      presets={ALL_PRESETS}
    />
  )
}

/**
 * The X tab: post URLs (x.com or twitter.com), videos from tweets and
 * threads. Multi-video posts expand into one queue item each.
 */
export function TwitterView(): JSX.Element {
  return (
    <MediaFormCard
      defaultPreset="p720"
      heading="Post URL"
      placeholder="https://x.com/user/status/…"
      presets={X_PRESET_ORDER}
    />
  )
}

/** Instagram error strings frequently advertise cookies; make that friendly. */
function explainInstagramError(message: string): string {
  if (/cookies?/i.test(message)) {
    return (
      'Instagram wants login cookies — set them in Settings › Cookies. ' +
      'Public posts may still work without them.'
    )
  }
  return message
}

/** The Instagram tab: posts, Reels, and carousels (login cookies for access). */
export function InstagramView(): JSX.Element {
  return (
    <MediaFormCard
      defaultPreset="best"
      explain={explainInstagramError}
      heading="Post or Reel URL"
      placeholder="https://www.instagram.com/p/… · /reel/…"
      presets={X_PRESET_ORDER}
    />
  )
}

// -- Live Queue view ----------------------------------------------------------------

/** Byte count → `3.2 MiB` (si? no — yt-dlp uses KiB/MiB/GiB). */
function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = unit === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0
  return `${value.toFixed(decimals)} ${units[unit]}`
}

/** Seconds → `mm:ss` (or `1:02:03`). */
function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h === 0 ? `${m}:${pad(s)}` : `${h}:${pad(m)}:${pad(s)}`
}

const STATE_TONE: Record<DownloadState, 'neutral' | 'accent' | 'success' | 'danger' | 'warning'> = {
  queued: 'neutral',
  downloading: 'accent',
  paused: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}

/** Secondary line under a download title. */
function statusLine(item: DownloadItem): string {
  switch (item.state) {
    case 'queued':
      return 'Waiting for a free slot…'
    case 'downloading': {
      if (item.stage === 'processing') {
        return 'Processing with ffmpeg…'
      }
      const total = item.totalBytes === null ? 'unknown size' : formatBytes(item.totalBytes)
      const speed = item.bytesPerSecond === null ? '' : ` · ${formatBytes(item.bytesPerSecond)}/s`
      const eta = formatEta(item.etaSeconds) === null ? '' : ` · ETA ${formatEta(item.etaSeconds)}`
      return `${formatBytes(item.downloadedBytes)} / ${total}${speed}${eta}`
    }
    case 'paused':
      return 'Paused — partial data kept for resume'
    case 'completed':
      return `Finished · saved in ${item.outDir}`
    case 'failed':
      return item.error ?? 'Download failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

function DownloadRow({ item }: { item: DownloadItem }): JSX.Element {
  const { pause, resume, cancel, retry, remove, reveal, open } = useDownloads()
  const toast = useToast()

  const openFile = (): void => {
    void open(item.id).catch((error: unknown) => {
      toast(errorText(error), 'danger')
    })
  }

  return (
    <div className="download-row">
      <div className="dl-header">
        <div className="dl-main">
          <div className="dl-title">{item.title ?? item.url}</div>
          <div className="dl-status">{statusLine(item)}</div>
        </div>
        <div className="dl-actions">
          {item.state === 'downloading' ? (
            <>
              <Button onClick={() => pause(item.id)} small title="Pause" variant="ghost">
                Pause
              </Button>
              <Button onClick={() => cancel(item.id)} small title="Cancel" variant="danger">
                Cancel
              </Button>
            </>
          ) : null}
          {item.state === 'paused' ? (
            <>
              <Button onClick={() => resume(item.id)} small title="Resume">
                Resume
              </Button>
              <Button onClick={() => cancel(item.id)} small title="Cancel" variant="danger">
                Cancel
              </Button>
            </>
          ) : null}
          {item.state === 'queued' ? (
            <Button onClick={() => cancel(item.id)} small title="Cancel" variant="danger">
              Cancel
            </Button>
          ) : null}
          {item.state === 'failed' ? (
            <>
              <Button onClick={() => retry(item.id)} small title="Try again">
                Retry
              </Button>
              <Button onClick={() => remove(item.id)} small title="Remove" variant="ghost">
                Remove
              </Button>
            </>
          ) : null}
          {item.state === 'completed' ? (
            <>
              <Button onClick={openFile} small title="Open file">
                Open
              </Button>
              <Button onClick={() => reveal(item.id)} small title="Show in folder" variant="ghost">
                Show in folder
              </Button>
              <Button onClick={() => remove(item.id)} small title="Remove" variant="ghost">
                Remove
              </Button>
            </>
          ) : null}
          {item.state === 'cancelled' ? (
            <Button onClick={() => remove(item.id)} small title="Remove" variant="ghost">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="dl-progress">
        <Chip tone={STATE_TONE[item.state]}>{item.state}</Chip>
        <Chip tone="accent">{PRESET_LABEL[item.quality]}</Chip>
        <ProgressBar value={item.percent} />
      </div>
    </div>
  )
}

export function QueueView(): JSX.Element {
  const { items, add } = useDownloads()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<QueueFilter>('all')
  const toast = useToast()

  const submit = (): void => {
    if (busy) return
    setBusy(true)
    add(url)
      .then((result) => {
        setUrl('')
        toast(result.note ?? 'Added to the queue', 'success')
      })
      .catch((error: unknown) => {
        toast(errorText(error), 'danger')
      })
      .finally(() => setBusy(false))
  }

  const visible = filterQueue(items, filter, query)

  return (
    <>
      <section className="card">
        <h2 className="card-title">Add a link</h2>
        <p className="card-text muted">
          Anything yt-dlp supports — YouTube, X posts, videos, clips.
        </p>
        <div className="add-form">
          <Entry
            disabled={busy}
            onChange={setUrl}
            onSubmit={submit}
            placeholder="https://…"
            value={url}
          />
          <Button disabled={busy || url.trim().length === 0} onClick={submit}>
            {busy ? 'Fetching…' : 'Add'}
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">
          Queue {items.length > 0 ? <span className="count-pill">{items.length}</span> : null}
        </h2>
        <div className="queue-controls">
          <Entry
            onChange={setQuery}
            onSubmit={() => {}}
            placeholder="Search title, file name, or URL…"
            value={query}
          />
          <div className="filter-pills" role="group" aria-label="Queue filter">
            {QUEUE_FILTERS.map((entry) => (
              <button
                className={`filter-pill${filter === entry.id ? ' selected' : ''}`}
                key={entry.id}
                onClick={() => setFilter(entry.id)}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 ? (
          <p className="card-text muted">Nothing here yet — paste a link above.</p>
        ) : visible.length === 0 ? (
          <p className="card-text muted">Nothing matches — try another search or filter.</p>
        ) : (
          <div className="download-list">
            {visible.map((item) => (
              <DownloadRow item={item} key={item.id} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// -- Live History view -----------------------------------------------------------------

type QueueFilter = 'all' | 'active' | 'done' | 'failed'

const QUEUE_FILTERS: readonly { id: QueueFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
  { id: 'failed', label: 'Failed' },
]

const ACTIVE_FILTER_STATES: readonly DownloadState[] = ['queued', 'downloading', 'paused']

/** Text + state filter over queue items (case-insensitive). */
function filterQueue(
  items: readonly DownloadItem[],
  filter: QueueFilter,
  query: string,
): DownloadItem[] {
  const needle = query.trim().toLowerCase()
  return items.filter((item) => {
    if (filter === 'active' && !ACTIVE_FILTER_STATES.includes(item.state)) return false
    if (filter === 'done' && item.state !== 'completed') return false
    if (filter === 'failed' && !(item.state === 'failed' || item.state === 'cancelled')) {
      return false
    }
    if (needle === '') return true
    return `${item.title ?? ''} ${item.filename ?? ''} ${item.url}`.toLowerCase().includes(needle)
  })
}

/** Local timestamp → human string (for history rows). */
function formatFinished(finishedAt: number | null): string {
  return finishedAt === null ? 'unknown date' : new Date(finishedAt).toLocaleString()
}

/** The History view: every finished/failed/cancelled download, searchable. */
export function HistoryView(): JSX.Element {
  const { items, remove, retry, reveal, open, clearHistory } = useDownloads()
  const [query, setQuery] = useState('')
  const toast = useToast()

  const finished = items.filter((item) => isFinalHistoryState(item.state))
  const filtered = filterQueue(finished, 'all', query).sort(
    (a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0),
  )

  const clear = (): void => {
    void clearHistory()
      .then(() => {
        setQuery('')
        toast('History cleared', 'success')
      })
      .catch((error: unknown) => {
        toast(errorText(error), 'danger')
      })
  }

  const openFile = (id: string): void => {
    void open(id).catch((error: unknown) => {
      toast(errorText(error), 'danger')
    })
  }

  return (
    <>
      <section className="card">
        <h2 className="card-title">
          History{' '}
          {finished.length > 0 ? <span className="count-pill">{finished.length}</span> : null}
        </h2>
        <p className="card-text muted">
          Finished downloads survive app restarts. Files stay on disk until you delete them
          yourself.
        </p>
        <div className="queue-controls">
          <Entry
            onChange={setQuery}
            onSubmit={() => {}}
            placeholder="Search title, file name, or URL…"
            value={query}
          />
          {finished.length > 0 ? (
            <Button onClick={clear} small variant="ghost">
              Clear history
            </Button>
          ) : null}
        </div>
      </section>

      <section className="card">
        {filtered.length === 0 ? (
          <p className="card-text muted">
            {finished.length === 0 ? 'No finished downloads yet.' : 'Nothing matches this search.'}
          </p>
        ) : (
          <div className="history-list">
            {filtered.map((item) => (
              <div className="history-row" key={item.id}>
                <div className="history-chips">
                  <Chip tone={STATE_TONE[item.state]}>{item.state}</Chip>
                  <Chip tone="neutral">{sourceOfUrl(item.url)}</Chip>
                </div>
                <div className="history-info">
                  <div className="preview-title">{item.title ?? item.url}</div>
                  <div className="preview-meta">
                    {item.filename ?? 'file name unknown'} · {formatFinished(item.finishedAt)}
                  </div>
                </div>
                <div className="history-actions">
                  {item.state === 'completed' ? (
                    <Button onClick={() => openFile(item.id)} small title="Open file">
                      Open
                    </Button>
                  ) : null}
                  {item.state === 'completed' ? (
                    <Button
                      onClick={() => reveal(item.id)}
                      small
                      title="Show in folder"
                      variant="ghost"
                    >
                      Show in folder
                    </Button>
                  ) : null}
                  {item.state === 'failed' ? (
                    <Button onClick={() => retry(item.id)} small title="Download again">
                      Retry
                    </Button>
                  ) : null}
                  <Button onClick={() => remove(item.id)} small title="Remove" variant="ghost">
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// -- Registry ----------------------------------------------------------------------

export const VIEW_LIST: readonly ViewDef[] = [
  {
    Component: HomeView,
    id: 'home',
    label: 'Home',
    heading: 'Meowdler',
    blurb: 'Catppuccin-themed downloader for YouTube, X, and Instagram',
  },
  {
    Component: YouTubeView,
    id: 'youtube',
    label: 'YouTube',
    heading: 'YouTube',
    blurb: 'Videos, playlists, and audio extraction',
  },
  {
    Component: TwitterView,
    id: 'twitter',
    label: 'X',
    heading: 'X (Twitter)',
    blurb: 'Posts and threads at original quality',
  },
  {
    Component: InstagramView,
    id: 'instagram',
    label: 'Instagram',
    heading: 'Instagram',
    blurb: 'Posts, Reels, and Stories via your own session',
  },
  {
    Component: QueueView,
    id: 'queue',
    label: 'Queue',
    heading: 'Queue',
    blurb: 'Live download management',
  },
  {
    Component: HistoryView,
    id: 'history',
    label: 'History',
    heading: 'History',
    blurb: 'Everything you have downloaded',
  },
  {
    Component: SettingsView,
    id: 'settings',
    label: 'Settings',
    heading: 'Settings',
    blurb: 'Appearance, downloads, and the engine',
  },
]

const VIEW_BY_ID = new Map(VIEW_LIST.map((view) => [view.id, view]))

export function viewById(id: ViewId): ViewDef {
  const view = VIEW_BY_ID.get(id)
  return view ?? (VIEW_LIST[0] as ViewDef)
}
