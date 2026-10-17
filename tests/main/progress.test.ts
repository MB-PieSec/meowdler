/**
 * Unit tests for the pure yt-dlp output parsers (`src/main/progress.ts`).
 * Sample lines are the ones documented as real engine output.
 */
import { describe, expect, it } from 'vitest'
import {
  extractFilePath,
  extractLastError,
  isProcessingStage,
  isStreamStart,
  parseEta,
  parseProgressLine,
} from '../../src/main/progress'

describe('parseEta', () => {
  it('parses MM:SS as seconds', () => {
    expect(parseEta('02:22')).toBe(142)
  })
  it('parses H:MM:SS as seconds', () => {
    expect(parseEta('01:02:03')).toBe(3723)
  })
  it('returns null for Unknown', () => {
    expect(parseEta('Unknown')).toBeNull()
  })
  it('returns null for malformed text', () => {
    expect(parseEta(':')).toBeNull()
    expect(parseEta('nope')).toBeNull()
  })
})

describe('extractLastError', () => {
  it('returns the last ERROR line', () => {
    const stderr = [
      'ERROR: first failure',
      'WARNING: skipping cookie file entry',
      "ERROR: '/tmp/x' does not look like a Netscape format cookies file",
      '',
    ].join('\n')
    expect(extractLastError(stderr)).toBe(
      "ERROR: '/tmp/x' does not look like a Netscape format cookies file",
    )
  })
  it('returns null with no errors', () => {
    expect(extractLastError('all good\nWARNING: fine')).toBeNull()
    expect(extractLastError('')).toBeNull()
  })
})

describe('parseProgressLine', () => {
  it('parses a real download tick', () => {
    const tick = parseProgressLine('[download]   0.3% of    9.42MiB at    67.47KiB/s ETA 02:22')
    expect(tick).not.toBeNull()
    expect(tick?.percent).toBeCloseTo(0.3)
    expect(tick?.totalBytes).toBeCloseTo(9.42 * 1024 ** 2)
    expect(tick?.bytesPerSecond).toBeCloseTo(67.47 * 1024)
    expect(tick?.etaSeconds).toBe(142)
    expect(tick?.finishedTick).toBe(false)
    // Derived bytes = percent × total.
    expect(tick?.downloadedBytes).toBe(Math.round((9.42 * 1024 ** 2 * 0.3) / 100))
  })

  it('parses the estimated-total tick (~ prefix) with Unknown speed', () => {
    const tick = parseProgressLine('[download]  50.0% of ~ 12.00MiB at Unknown speed ETA Unknown')
    expect(tick).not.toBeNull()
    expect(tick?.percent).toBe(50)
    expect(tick?.totalBytes).toBeCloseTo(12 * 1024 ** 2)
    expect(tick?.bytesPerSecond).toBeNull()
    expect(tick?.etaSeconds).toBeNull()
    expect(tick?.downloadedBytes).toBe(Math.round((12 * 1024 ** 2 * 50) / 100))
  })

  it('marks the closing 100% line as a finished tick', () => {
    const tick = parseProgressLine('[download] 100.0% of   15.00MiB in 00:10')
    expect(tick).not.toBeNull()
    expect(tick?.percent).toBe(100)
    expect(tick?.finishedTick).toBe(true)
  })

  it('parses GiB totals and long ETAs', () => {
    const tick = parseProgressLine('[download] 25.0% of 1.50GiB at 640.00KiB/s ETA 01:00:00')
    expect(tick?.totalBytes).toBeCloseTo(1.5 * 1024 ** 3)
    expect(tick?.bytesPerSecond).toBeCloseTo(640 * 1024)
    expect(tick?.etaSeconds).toBe(3600)
  })

  it('caps percent at 100', () => {
    const tick = parseProgressLine('[download] 120.0% of 2.00MiB')
    expect(tick?.percent).toBe(100)
  })

  it('returns null for non-progress lines', () => {
    expect(parseProgressLine('[Merger] Merging formats into "/a/b.mp4"')).toBeNull()
    expect(parseProgressLine('[download] Destination: /a/b.mp4')).toBeNull()
    expect(parseProgressLine('metadata line without prefix')).toBeNull()
    expect(parseProgressLine('[download] has no percent marker')).toBeNull()
  })
})

describe('extractFilePath', () => {
  it('reads plain Destination lines', () => {
    expect(extractFilePath('[download] Destination: /a/b.mp4')).toBe('/a/b.mp4')
    expect(extractFilePath('[ExtractAudio] Destination: /a/c.m4a')).toBe('/a/c.m4a')
  })
  it('strips fragment markers and part tails from destinations', () => {
    expect(extractFilePath('[download] Destination: /a/video.f397.mp4')).toBe('/a/video.mp4')
    expect(extractFilePath('[download] Destination: /a/video.f397.mp4.part')).toBe('/a/video.mp4')
    expect(extractFilePath('[download] Destination: /a/video.f397.mp4.part-12')).toBe(
      '/a/video.mp4',
    )
  })
  it('reads the merged output from Merger lines', () => {
    expect(extractFilePath('[Merger] Merging formats into "/a/b [id].mp4"')).toBe('/a/b [id].mp4')
  })
  it('reads already-downloaded paths', () => {
    expect(extractFilePath('[download] /a/b.mp4 has already been downloaded')).toBe('/a/b.mp4')
  })
  it('returns null for unrelated lines', () => {
    expect(extractFilePath('[download] 50.0% of 2.00MiB')).toBeNull()
    expect(extractFilePath('')).toBeNull()
  })
})

describe('stage classifiers', () => {
  it('flags post-download ffmpeg stages', () => {
    expect(isProcessingStage('[Merger] Merging formats into "/a/b.mp4"')).toBe(true)
    expect(isProcessingStage('[ExtractAudio] Destination: /a/b.m4a')).toBe(true)
    expect(isProcessingStage('[VideoConvertor] something')).toBe(true)
    expect(isProcessingStage('[FixupM3u8] something')).toBe(true)
    expect(isProcessingStage('[download] 50.0% of 2.00MiB')).toBe(false)
    expect(isProcessingStage('[download] Destination: /a/b.mp4')).toBe(false)
  })
  it('flags stream starts only for Destination lines', () => {
    expect(isStreamStart('[download] Destination: /a/leg.mp4')).toBe(true)
    expect(isStreamStart('[download]   50.0% of 2.00MiB')).toBe(false)
    expect(isStreamStart('[Merger] Merging formats into "/a/b.mp4"')).toBe(false)
  })
})
