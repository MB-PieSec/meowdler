/**
 * Pure parsers for yt-dlp progress output. No Electron imports here so the
 * logic is unit-testable with plain Node. Line shapes were verified against
 * real output (verified 2026-08 binary):
 *
 *   [download]   0.3% of    9.42MiB at    67.47KiB/s ETA 02:22
 *   [download]  50.0% of ~ 12.00MiB at Unknown speed ETA Unknown
 *   [download] 100.0% of   15.00MiB in 00:10
 */

/** One parsed progress tick. */
export interface ProgressInfo {
  percent: number
  downloadedBytes: number
  totalBytes: number | null
  bytesPerSecond: number | null
  etaSeconds: number | null
  /** True when this is the closing "100% in <time>" line. */
  finishedTick: boolean
}

/** Converts a yt-dlp size unit to bytes. */
function unitToBytes(value: number, unit: string): number {
  switch (unit) {
    case 'GiB':
      return value * 1024 ** 3
    case 'MiB':
      return value * 1024 ** 2
    case 'KiB':
      return value * 1024
    default:
      return value
  }
}

/** Parses `[-]HH:MM:SS` / `MM:SS` seconds. */
export function parseEta(text: string): number | null {
  if (text === 'Unknown') return null
  const parts = text.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/** Extracts the last human-readable `ERROR:` line from yt-dlp stderr. */
export function extractLastError(stderr: string): string | null {
  const matches = stderr.match(/^.*ERROR:.*$/gm)
  const last = matches?.at(-1)?.trim()
  return last === undefined ? null : (last ?? null)
}

const PROGRESS_PREFIX = '[download]'
const PERCENT_RE = /([\d.]+)\s*%/
const OF_RE = /of\s+(?:~\s*)?(Unknown|[\d.]+\s*[KMG]?i?B)/i
const SPEED_RE = /at\s+(Unknown|\s*[\d.]+\s*[KMG]?i?B\/s)/i

/**
 * Parses one stdout line into a {@link ProgressInfo}, or `null` for lines
 * that carry no progress information (metadata walks, merging, warnings).
 */
export function parseProgressLine(line: string): ProgressInfo | null {
  if (!line.startsWith(PROGRESS_PREFIX)) return null

  const percentText = PERCENT_RE.exec(line)?.[1]
  if (percentText === undefined) return null
  const percent = Number.parseFloat(percentText)
  if (!Number.isFinite(percent)) return null

  // Bytes at this exact moment are not printed per tick; deriving them from
  // percent × total matches the bar visually and is accurate enough for UI.
  const ofMatch = OF_RE.exec(line)?.[1]
  let totalBytes: number | null = null
  if (ofMatch !== undefined && !ofMatch.startsWith('Unknown')) {
    const sizeText = /([\d.]+)\s*([KMG]?i?B)/i.exec(ofMatch)
    const value = sizeText?.[1]
    const unit = sizeText?.[2]
    if (value !== undefined && unit !== undefined) {
      totalBytes = unitToBytes(Number.parseFloat(value), unit)
    }
  }

  let bytesPerSecond: number | null = null
  const speedText = SPEED_RE.exec(line)?.[1]
  if (speedText !== undefined && speedText !== 'Unknown') {
    const unitMatch = /([\d.]+)\s*([KMG]i?B)\/s/i.exec(speedText)
    const value = unitMatch?.[1]
    const unit = unitMatch?.[2]
    if (value !== undefined && unit !== undefined) {
      bytesPerSecond = unitToBytes(Number.parseFloat(value), unit)
    }
  }

  const etaText = /ETA\s+([\d:]+|Unknown)/.exec(line)?.[1]
  const etaSeconds = etaText === undefined ? null : parseEta(etaText)

  const FINISHED_RE = /100(?:\.0+)?%[\s\S]*in\s+[\d:]+/
  const finishedTick = FINISHED_RE.test(line)

  return {
    percent: Math.min(100, percent),
    downloadedBytes: totalBytes === null ? 0 : Math.round((totalBytes * percent) / 100),
    totalBytes,
    bytesPerSecond,
    etaSeconds,
    finishedTick,
  }
}

/**
 * Extracts the final output path from a yt-dlp line.
 * Handles `[download] Destination: <path>`, `[Merger] Merging formats into
 * "<path>"`, `[ExtractAudio] Destination: <path>`, and the various
 * `... has already been downloaded` notices that print the bare path.
 */
export function extractFilePath(line: string): string | null {
  const already = /^\[download\]\s+(.+?)\s+has already been downloaded\s*$/.exec(line)
  const alreadyMatch = already?.[1]
  if (alreadyMatch !== undefined && alreadyMatch.length > 0) return alreadyMatch

  const quoted = /(?:Merging formats into|destination)\s+"(.+?)"[^"]*$/i.exec(line)
  const quotedMatch = quoted?.[1]
  if (quotedMatch !== undefined && quotedMatch.length > 0) return quotedMatch

  const destination = /Destination:\s+(.+?)\s*$/.exec(line)
  const destinationMatch = destination?.[1]
  if (destinationMatch !== undefined && destinationMatch.length > 0) {
    // Fragment downloads report intermediate names (`video.f397.mp4`,
    // possibly with a `.part` tail); rebasing to the final merged basename.
    return destinationMatch.replace(/\.part(-\d+)?$/, '').replace(/\.f\d+(?=\.\w+$)/, '')
  }

  return null
}

/** Returns 'processing' when `line` belongs to a post-download ffmpeg step. */
export function isProcessingStage(line: string): boolean {
  return /^\[(merger|metadataconsumer|embedthumbnail|extractaudio|videoconvertor|fixup_.*|modifychains?)\]/i.test(
    line,
  )
}
