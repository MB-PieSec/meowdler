/**
 * Unit tests for the shared validators (`src/shared/settings.ts` and
 * `src/shared/downloads.ts`): the guards that keep malformed persisted /
 * wire data from poisoning the app.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from '../../src/shared/settings'
import {
  isQualityPreset,
  isFinalHistoryState,
  parseDownloadItem,
  parseDownloadOptions,
  parseHistoryEntries,
  sourceOfUrl,
} from '../../src/shared/downloads'

describe('parseSettings', () => {
  it('falls back to defaults for junk input', () => {
    for (const junk of [null, undefined, 42, 'x', {}, '{"flavor":"mocha"}']) {
      expect(parseSettings(junk)).toEqual({ ...DEFAULT_SETTINGS })
    }
  })
  it('drops unknown flavors', () => {
    expect(parseSettings({ flavor: 'neon-96' }).flavor).toBe('mocha')
    expect(parseSettings({ flavor: 'frappe' }).flavor).toBe('frappe')
  })
  it('validates one cookies block; unknown values fall back to off-mode', () => {
    expect(parseSettings({ flavor: 'mocha', cookies: 'x' }).cookies).toEqual({
      mode: 'off',
      file: null,
      browser: null,
    })
    expect(
      parseSettings({ flavor: 'mocha', cookies: { mode: 'file', file: '/a.txt' } }).cookies,
    ).toEqual({ mode: 'file', file: '/a.txt', browser: null })
    expect(parseSettings({ flavor: 'mocha', cookies: { mode: 'file', file: 42 } }).cookies).toEqual(
      { mode: 'file', file: null, browser: null },
    )
  })
  it('rejects non-listed browsers', () => {
    expect(
      parseSettings({ flavor: 'mocha', cookies: { mode: 'browser', browser: 'netscape' } }).cookies
        .browser,
    ).toBeNull()
    expect(
      parseSettings({ flavor: 'mocha', cookies: { mode: 'browser', browser: 'vivaldi' } }).cookies
        .browser,
    ).toBe('vivaldi')
  })
  it('clamps concurrency and validates the outDir shape', () => {
    expect(parseSettings({ flavor: 'mocha', downloads: { concurrency: 9 } }).downloads).toEqual({
      outDir: null,
      concurrency: 4,
    })
    expect(
      parseSettings({ flavor: 'mocha', downloads: { concurrency: 0 } }).downloads.concurrency,
    ).toBe(1)
    expect(
      parseSettings({ flavor: 'mocha', downloads: { concurrency: 'NaN' } }).downloads.concurrency,
    ).toBe(2)
    expect(
      parseSettings({ flavor: 'mocha', downloads: { outDir: '/path/to/videos' } }).downloads.outDir,
    ).toBe('/path/to/videos')
    expect(
      parseSettings({ flavor: 'mocha', downloads: { outDir: 'C:\\Users\\me\\Videos' } }).downloads
        .outDir,
    ).toBe('C:\\Users\\me\\Videos')
    expect(
      parseSettings({ flavor: 'mocha', downloads: { outDir: 'relative/path' } }).downloads.outDir,
    ).toBeNull()
  })
})

describe('download options + presets', () => {
  it('coerces wire options with a default fallback', () => {
    expect(parseDownloadOptions({ quality: 'audio-mp3' })).toEqual({ quality: 'audio-mp3' })
    expect(parseDownloadOptions({ quality: '8k' })).toEqual({ quality: 'p1080' })
    expect(parseDownloadOptions(null)).toEqual({ quality: 'p1080' })
    expect(parseDownloadOptions('best')).toEqual({ quality: 'p1080' })
  })
  it('recognizes exactly the shipped presets', () => {
    for (const ok of ['best', 'p1080', 'p720', 'p480', 'p360', 'audio-mp3', 'audio-m4a']) {
      expect(isQualityPreset(ok)).toBe(true)
    }
    expect(isQualityPreset('p2160')).toBe(false)
    expect(isQualityPreset(null)).toBe(false)
  })
})

describe('history ledger validation', () => {
  const base = {
    id: 'i1',
    url: 'https://platform.test/v',
    outDir: '/dl',
    state: 'completed',
  }
  it('accepts a complete finalized item with coercion', () => {
    const item = parseDownloadItem({ ...base, percent: 'NaN', quality: 'p2160' })
    expect(item).not.toBeNull()
    expect(item?.state).toBe('completed')
    expect(item?.percent).toBe(0)
    expect(item?.quality).toBe('best')
    expect(item?.title).toBeNull()
  })
  it('rejects unfinished states and missing core fields', () => {
    expect(parseDownloadItem({ ...base, id: '' })).toBeNull()
    expect(parseDownloadItem({ ...base, state: 'downloading' })).toBeNull()
    expect(parseDownloadItem({ ...base, state: 7 })).toBeNull()
    expect(parseDownloadItem({ ...base, outDir: '' })).toBeNull()
    expect(parseDownloadItem(null)).toBeNull()
    expect(parseDownloadItem('x')).toBeNull()
  })
  it('recognizes exactly the persisted states', () => {
    expect(isFinalHistoryState('completed')).toBe(true)
    expect(isFinalHistoryState('failed')).toBe(true)
    expect(isFinalHistoryState('cancelled')).toBe(true)
    expect(isFinalHistoryState('queued')).toBe(false)
    expect(isFinalHistoryState('paused')).toBe(false)
  })
  it('parses ledgers: corrupt lines skipped, duplicates dropped', () => {
    const audio = parseDownloadOptions({ quality: 'audio-mp3' }).quality
    const items = [
      { ...base, quality: audio, percent: 100, bytesPerSecond: 1024 },
      'corrupt line',
      { ...base, percent: 100 },
      null,
    ]
    expect(parseHistoryEntries(items)).toHaveLength(1)
    expect(parseHistoryEntries(items)[0]?.percent).toBe(100)
    expect(parseHistoryEntries('nope')).toEqual([])
    expect(parseHistoryEntries(null)).toEqual([])
  })
})

describe('sourceOfUrl', () => {
  it('recognizes the supported platforms, including subdomains', () => {
    expect(sourceOfUrl('https://www.youtube.com/watch?v=x')).toBe('YouTube')
    expect(sourceOfUrl('https://music.youtube.com/watch?v=x')).toBe('YouTube')
    expect(sourceOfUrl('https://youtu.be/x')).toBe('YouTube')
    expect(sourceOfUrl('https://youtube-nocookie.com/embed/x')).toBe('YouTube')
    expect(sourceOfUrl('https://x.com/user/status/1')).toBe('X')
    expect(sourceOfUrl('https://mobile.twitter.com/user')).toBe('X')
    expect(sourceOfUrl('https://pbs.twimg.com/media/abc')).toBe('X')
    expect(sourceOfUrl('https://www.instagram.com/p/xyz/')).toBe('Instagram')
  })
  it('falls back to a generic label', () => {
    expect(sourceOfUrl('https://vimeo.com/abc')).toBe('Web')
    expect(sourceOfUrl('not a url')).toBe('Web')
    expect(sourceOfUrl('')).toBe('Web')
  })
  it('can not be fooled by hostile hosts', () => {
    expect(sourceOfUrl('https://youtube.com.evil.test/watch?v=x')).toBe('Web')
  })
})
