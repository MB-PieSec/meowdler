/**
 * Unit tests for `src/main/ytdlp.ts` argument builders and validators:
 * cookie args / cookies.txt validation, and engine-error hints.
 * Electron is mocked (the module only uses `app` for path lookups).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/virtual/app',
    getPath: () => '/virtual/userdata',
  },
}))

import {
  cookieArgsFor,
  resolveCookieArgs,
  validateCookieFile,
  withEngineHint,
} from '../../src/main/ytdlp'
import type { CookieSettings } from '../../src/shared/settings'

const off: CookieSettings = { mode: 'off', file: null, browser: null }
const browser: CookieSettings = { mode: 'browser', file: null, browser: 'firefox' }
const file = (file: string | null): CookieSettings => ({ mode: 'file', file, browser: null })

/** Re-imports the module with a controlled spawnSync runtime probe outcome. */
async function importFresh(spawnStatus: number) {
  vi.resetModules()
  vi.doMock('node:child_process', () => ({
    spawn: vi.fn(),
    spawnSync: vi.fn(() => ({ status: spawnStatus, stdout: 'v22.0.0\n' })),
  }))
  return import('../../src/main/ytdlp')
}

let dir = ''

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meowdler-tests-'))
  fs.writeFileSync(path.join(dir, 'garbage.txt'), 'this is not netscape\nanother junk line\n')
  fs.writeFileSync(path.join(dir, 'header-only.txt'), '# Netscape HTTP Cookie File\n# hi\n\n')
  fs.writeFileSync(
    path.join(dir, 'tabfields.txt'),
    '.youtube.com\tTRUE\t/\tTRUE\t1893456000\tPREF\tvalue\n',
  )
  fs.writeFileSync(
    path.join(dir, 'valid.txt'),
    '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1893456000\tPREF\tvalue\n',
  )
  fs.writeFileSync(path.join(dir, 'noperm.txt'), '.youtube.com\tTRUE\t/\tTRUE\t1\tA\tb\n')
  try {
    fs.chmodSync(path.join(dir, 'noperm.txt'), 0o000)
  } catch {
    // Best-effort: a root CI/developer would keep it readable.
  }
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('cookieArgsFor (pure translation)', () => {
  it('returns empty args when off', () => {
    expect(cookieArgsFor(off)).toEqual([])
  })
  it('passes file mode through', () => {
    expect(cookieArgsFor(file('/a/cookies.txt'))).toEqual(['--cookies', '/a/cookies.txt'])
    expect(cookieArgsFor(file(null))).toEqual([])
  })
  it('passes browser mode through', () => {
    expect(cookieArgsFor(browser)).toEqual(['--cookies-from-browser', 'firefox'])
    expect(cookieArgsFor({ mode: 'browser', file: null, browser: null })).toEqual([])
  })
})

describe('validateCookieFile', () => {
  it('accepts a standard Netscape file', () => {
    expect(validateCookieFile(path.join(dir, 'valid.txt')).status).toBe('ok')
  })
  it('accepts a 7-tab-field data line without a header', () => {
    expect(validateCookieFile(path.join(dir, 'tabfields.txt')).status).toBe('ok')
  })
  it('accepts a header-only file (yt-dlp tolerates zero cookies)', () => {
    expect(validateCookieFile(path.join(dir, 'header-only.txt')).status).toBe('ok')
  })
  it('rejects junk as format errors', () => {
    expect(validateCookieFile(path.join(dir, 'garbage.txt')).status).toBe('format')
  })
  it('reports missing files (and directories) without throwing', () => {
    expect(validateCookieFile(path.join(dir, 'nope.txt')).status).toBe('missing')
    expect(validateCookieFile(dir).status).toBe('missing')
  })
  it('reports unreadable files', () => {
    expect(validateCookieFile(path.join(dir, 'noperm.txt')).status).toBe('unreadable')
  })
})

describe('resolveCookieArgs (pre-spawn guard)', () => {
  it('delegates when valid', () => {
    expect(resolveCookieArgs(file(path.join(dir, 'valid.txt')))).toEqual([
      '--cookies',
      path.join(dir, 'valid.txt'),
    ])
    expect(resolveCookieArgs(off)).toEqual([])
    expect(resolveCookieArgs(browser)).toEqual(['--cookies-from-browser', 'firefox'])
  })
  it('throws instead of silently ignoring a broken cookies file', () => {
    expect(() => resolveCookieArgs(file(path.join(dir, 'garbage.txt')))).toThrow(/Netscape format/)
    expect(() => resolveCookieArgs(file(path.join(dir, 'nope.txt')))).toThrow(/gone or unreadable/)
    expect(() => resolveCookieArgs(file(path.join(dir, 'noperm.txt')))).toThrow(/cannot be read/)
    expect(() => resolveCookieArgs(file(null))).toThrow(/no file is chosen/)
  })
  it('points every failure at Settings → Cookies', () => {
    for (const broken of [
      file(path.join(dir, 'garbage.txt')),
      file(path.join(dir, 'nope.txt')),
      file(path.join(dir, 'noperm.txt')),
      file(null),
    ]) {
      expect(() => resolveCookieArgs(broken)).toThrow('Settings → Cookies')
    }
  })
})

describe('withEngineHint (cookie + engine failures)', () => {
  it('routes stale-extractor failures to the engine updater', () => {
    const hint = withEngineHint('ERROR: unable to extract hidden data')
    expect(hint).toContain('Check engine updates')
    expect(hint).not.toContain('(also:')
  })
  it('routes ffmpeg failures to an installation hint', () => {
    expect(
      withEngineHint(
        'ERROR: ffmpeg not found. Please install or provide the path using --ffmpeg-location',
      ),
    ).toMatch(/Fix: ffmpeg is missing/)
  })
  it('hints browser-not-installed', () => {
    const message = 'ERROR: could not find opera cookies database in "/home/u/.config/opera"'
    expect(withEngineHint(message)).toContain('pick another browser in Settings → Cookies')
  })
  it('hints a locked cookie store', () => {
    const message = 'ERROR: could not copy chrome cookies database: database is locked'
    expect(withEngineHint(message)).toContain('close it fully and retry')
  })
  it('hints non-Netscape cookie files seen by the engine', () => {
    const message = "ERROR: '/tmp/x' does not look like a Netscape format cookies file"
    expect(withEngineHint(message)).toMatch(/re-export a Netscape-format cookies\.txt/)
  })
  it('leaves ordinary failures alone', () => {
    expect(withEngineHint('ERROR: [youtube] id: This video is unavailable')).not.toContain('Fix:')
  })

  it('mentions no runtime on walls when none resolves', async () => {
    const fresh = await importFresh(1)
    const hint = fresh.withEngineHint('ERROR: Sign in to confirm that you are not a bot')
    expect(hint).toContain('the JavaScript runtime that YouTube needs is missing')
  })

  it('does not add the runtime note when a runtime resolved', async () => {
    const fresh = await importFresh(0)
    const hint = fresh.withEngineHint('ERROR: Sign in to confirm that you are not a bot')
    expect(hint).not.toContain('(also:')
    expect(hint).toContain('Settings → Cookies')
  })
})
