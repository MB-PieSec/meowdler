import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import type { EngineUpdateOutcome, EngineUpdateStatus } from '../shared/ipc'
import { readEngineVersions, updatedEngineBinaryPath } from './ytdlp'

/**
 * Independent yt-dlp engine updater — the bundled binary is pinned at build
 * time and the platform loaders it supports change constantly, so a newer
 * official release can be pulled into the (writable) userData directory.
 *
 *   - resolution priority lives in `resolveYtDlpBinary`: a validated
 *     userData copy before the bundled one, so installs take effect for
 *     the next probe/download without an app restart;
 *   - integrity: SHA2-256SUMS from the official release is checked before
 *     the swap (sha256 of the fetched asset must match its row exactly);
 *   - atomic swap: download → .new-<uuid> temp → checksum + test-run →
 *     chmod +x → rename over; any failure leaves the previous binary in
 *     place;
 *   - never swaps under a live engine: the caller passes the DownloadManager
 *     busy count (running downloads + open metadata probes) and the swap is
 *     blocked with a readable message instead;
 *   - no telemetry: traffic touches only api.github.com and release-asset
 *     storage on GitHub's CDN (github.com releases redirect there).
 */

const LATEST_RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'

/** Headers for GitHub API calls (the API requires a User-Agent). */
const CHECK_HEADERS: Record<string, string> = {
  'user-agent': 'Meowdler (desktop downloader)',
  accept: 'application/vnd.github+json',
}

/**
 * Streams a GitHub URL to disk over plain node:https. Used for the asset
 * payload because Electron main's global fetch is Chromium-net-backed and
 * behaves badly on some hosts; redirects to release-asset storage are
 * followed manually (each hop re-arms the stall timer).
 */
function downloadUrlToFile(url: string, dest: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error: Error | undefined): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error === undefined) {
        resolve()
      } else {
        reject(error)
      }
    }
    const timer = setTimeout(() => {
      finish(new Error(`Engine download timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    timer.unref()

    const request = (target: URL, hops: number): void => {
      if (hops > 5) {
        finish(new Error('Too many redirects in the engine download'))
        return
      }
      const req = https.get(
        target,
        { headers: { 'user-agent': CHECK_HEADERS['user-agent'] } },
        (response) => {
          const status = response.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status)) {
            const location = response.headers.location
            response.resume()
            if (location === undefined) {
              finish(new Error(`Engine download failed (HTTP ${status}, no redirect target)`))
              return
            }
            request(new URL(location, target), hops + 1)
            return
          }
          if (status !== 200) {
            response.resume()
            finish(new Error(`Engine download failed (HTTP ${status})`))
            return
          }
          const out = fs.createWriteStream(dest)
          response.on('error', (error) => finish(error))
          response.on('data', (chunk) => out.write(chunk))
          response.on('end', () => {
            out.end()
            out.on('finish', () => finish(undefined))
          })
          out.on('error', (error) => finish(error))
        },
      )
      req.on('error', (error) => finish(error))
    }
    request(new URL(url), 0)
  })
}

/** The official release asset for this OS+arch (matches the build lane). */
export function engineAssetName(): string {
  switch (process.platform) {
    case 'win32':
      return 'yt-dlp.exe'
    case 'darwin':
      // Universal Mach-O: runs natively on both x86_64 and arm64 hosts.
      return 'yt-dlp_macos'
    default:
      return 'yt-dlp_linux'
  }
}

interface LatestRelease {
  tag: string
  assetUrl: string
  sumsUrl: string
}

async function fetchLatestRelease(): Promise<LatestRelease> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: CHECK_HEADERS,
    signal: AbortSignal.timeout(10_000),
  })
  if (response.ok === false) {
    throw new Error(`GitHub returned ${response.status} for the engine release lookup`)
  }
  const json = (await response.json()) as {
    tag_name?: unknown
    assets?: { name?: unknown; browser_download_url?: unknown }[]
  }
  const assets = json.assets ?? []
  const wanted = engineAssetName()
  const asset = assets.find((entry) => entry.name === wanted)
  const sums = assets.find((entry) => entry.name === 'SHA2-256SUMS')
  if (typeof json.tag_name !== 'string') throw new Error('Unreadable engine release metadata')
  if (typeof asset?.browser_download_url !== 'string') {
    throw new Error(`No ${wanted} in the latest engine release`)
  }
  if (typeof sums?.browser_download_url !== 'string') {
    throw new Error('No SHA2-256SUMS file in the latest engine release')
  }
  return {
    tag: json.tag_name,
    assetUrl: asset.browser_download_url,
    sumsUrl: sums.browser_download_url,
  }
}

/** Numeric per-segment compare for date-style versions (`2026.10.01`). */
export function versionGreater(latest: string, current: string): boolean {
  const asNumbers = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const lh = asNumbers(latest)
  const ch = asNumbers(current)
  for (let i = 0; i < Math.max(lh.length, ch.length); i += 1) {
    const lv = lh[i] ?? 0
    const cv = ch[i] ?? 0
    if (lv !== cv) return lv > cv
  }
  return false
}

/** Cached last check result, read by `app:engine-info`. */
let cachedStatus: EngineUpdateStatus | null = null

export function engineUpdateStatus(): EngineUpdateStatus | null {
  return cachedStatus
}

/**
 * One quiet check: compares the live engine version to the official
 * release tag and records the outcome for the Settings readout. Never
 * throws — network failures land in the status cache as `error`.
 */
export async function checkEngineUpdate(): Promise<EngineUpdateOutcome> {
  const currentVersion = (await readEngineVersions()).ytdlpVersion
  try {
    const release = await fetchLatestRelease()
    // A broken/unrunnable engine (currentVersion null) counts as outdated.
    const upToDate =
      currentVersion !== null &&
      (currentVersion === release.tag || versionGreater(release.tag, currentVersion) === false)

    cachedStatus = {
      checkedAt: Date.now(),
      latestVersion: release.tag,
      status: upToDate ? 'up-to-date' : 'available',
      error: null,
    }
    return {
      mode: upToDate ? 'up-to-date' : 'available',
      currentVersion,
      latestVersion: release.tag,
      note: null,
      error: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cachedStatus = {
      checkedAt: Date.now(),
      latestVersion: null,
      status: 'error',
      error: message,
    }
    return { mode: 'error', currentVersion, latestVersion: null, note: null, error: message }
  }
}

/**
 * Fetches the release asset and its SHA2-256SUMS, verifies the archive
 * hash, test-runs the binary, and swaps it in atomically inside userData.
 * Skips everything when the live engine is already at (or past) the tag.
 */
export async function installEngineUpdate(busyCount: () => number): Promise<EngineUpdateOutcome> {
  const currentVersion = (await readEngineVersions()).ytdlpVersion
  const base = { currentVersion, latestVersion: null, note: null, error: null } as const
  try {
    const release = await fetchLatestRelease()
    if (
      currentVersion === release.tag ||
      versionGreater(release.tag, currentVersion ?? '') === false
    ) {
      cachedStatus = {
        checkedAt: Date.now(),
        latestVersion: release.tag,
        status: 'up-to-date',
        error: null,
      }
      return { ...base, mode: 'up-to-date', latestVersion: release.tag }
    }
    if (busyCount() > 0) {
      return {
        ...base,
        mode: 'blocked',
        latestVersion: release.tag,
        note: 'The engine is in use — wait for (or pause) active downloads, then update again',
      }
    }

    const target = updatedEngineBinaryPath()
    const temp = path.join(path.dirname(target), `.new-${randomUUID()}`)
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const sumsTemp = path.join(path.dirname(target), `.sums-${randomUUID()}`)
      try {
        await downloadUrlToFile(release.assetUrl, temp, 120_000)
        await downloadUrlToFile(release.sumsUrl, sumsTemp, 15_000)

        const expected = new RegExp(
          `^\\s*([0-9a-f]{64})\\s+\\**${escapeRegExp(engineAssetName())}\\s*$`,
          'm',
        )
        const sums = fs.readFileSync(sumsTemp, 'utf8')
        // Hash while streaming the downloaded file (no whole-binary buffer).
        const hasher = createHash('sha256')
        await new Promise<void>((resolve, reject) => {
          const stream = fs.createReadStream(temp)
          stream.on('data', (chunk) => hasher.update(chunk))
          stream.on('end', resolve)
          stream.on('error', (error: NodeJS.ErrnoException) => reject(error))
        })
        const actualHash = hasher.digest('hex')
        const expectedHash = expected.exec(sums)?.[1]
        if (expectedHash === undefined || expectedHash !== actualHash) {
          throw new Error('Checksum mismatch — the download was discarded, the old engine is kept')
        }
      } finally {
        fs.rmSync(sumsTemp, { force: true })
      }

      if (process.platform !== 'win32') fs.chmodSync(temp, 0o755)
      // The downloaded binary must actually run before it can win.
      const smoke = spawnSync(temp, ['--version'], { timeout: 5000, encoding: 'utf8' })
      if (smoke.status !== 0) throw new Error('The downloaded engine failed its smoke test')

      // Atomic swap; downloads were guaranteed idle above, so no live child
      // holds the previous binary (relevant on Windows file locks).
      fs.renameSync(temp, target)
    } finally {
      fs.rmSync(temp, { force: true })
    }

    cachedStatus = {
      checkedAt: Date.now(),
      latestVersion: release.tag,
      status: 'up-to-date',
      error: null,
    }
    return { ...base, mode: 'installed', latestVersion: release.tag }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Electron main's fetch is Chromium-network-backed; connection-level
    // failures hide the real reason in `cause` — surface it for the toast.
    const cause =
      error instanceof Error && 'cause' in error ? (error.cause as Error | undefined) : undefined
    const detail = cause instanceof Error ? `${message}: ${cause.message}` : message
    cachedStatus = { checkedAt: Date.now(), latestVersion: null, status: 'error', error: detail }
    return { ...base, mode: 'error', error: detail }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Schedules the silent start-up check. Fire-and-forget with a network
 * timeout; failure just means "no newer-engine badge" in Settings.
 */
export function scheduleStartupEngineCheck(): void {
  if (app.isPackaged === false) return
  setTimeout(() => {
    void checkEngineUpdate().catch(() => {})
  }, 4500).unref()
}
