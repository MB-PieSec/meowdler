/**
 * Unit tests for the spawn-time argument construction in
 * `src/main/ytdlp.ts` (`probeFlat` / `spawnYtDlpDownload`), most notably the
 * `--` guard that keeps URLs from being parsed as engine flags.
 * `spawn` is mocked; no engine binary runs.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/virtual/app',
    getPath: () => '/virtual/userdata',
  },
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  // Runtime probe: pretend the JS runtime resolved (assertions below are
  // runtime-neutral; this keeps `jsRuntimeArgs()` deterministic).
  spawnSync: vi.fn(() => ({ status: 0, stdout: 'v22.0.0\n' })),
}))

import { probeFlat, spawnYtDlpDownload, type DownloadHandlers } from '../../src/main/ytdlp'

/** A child double that records listeners and can emit events. */
interface FakeChild {
  stdout: { setEncoding: (encoding: string) => void; on: (event: string, cb: never) => void }
  stderr: { on: (event: string, cb: never) => void }
  on: (event: string, cb: never) => void
  kill: () => void
  emitClose: (code: number) => void
  emitError: (error: Error) => void
  emitStdout: (chunk: string) => void
  emitStderr: (chunk: string) => void
}

function makeFakeChild(): FakeChild {
  const stdoutSinks: Array<(chunk: string) => void> = []
  const stderrSinks: Array<(chunk: string) => void> = []
  const closeCbs: Array<(code: number) => void> = []
  const errorCbs: Array<(error: Error) => void> = []
  return {
    stdout: {
      setEncoding: vi.fn(),
      on: vi.fn((event: string, cb: never) => {
        if (event === 'data') stdoutSinks.push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: never) => {
        if (event === 'data') stderrSinks.push(cb)
      }),
    },
    on: vi.fn((event: string, cb: never) => {
      if (event === 'close') closeCbs.push(cb)
      if (event === 'error') errorCbs.push(cb)
    }),
    kill: vi.fn(),
    emitClose: (code) => closeCbs.forEach((cb) => cb(code)),
    emitError: (error) => errorCbs.forEach((cb) => cb(error)),
    emitStdout: (chunk) => stdoutSinks.forEach((cb) => cb(chunk)),
    emitStderr: (chunk) => stderrSinks.forEach((cb) => cb(chunk)),
  }
}

/** Callbacks blob for spawnYtDlpDownload that records nothing. */
const silentHandlers: DownloadHandlers = {
  onProgress: () => {},
  onProcessing: () => {},
  onStreamStart: () => {},
  onOutputPath: () => {},
  onError: () => {},
}

beforeEach(() => {
  spawnMock.mockReset()
})

/** The most recent `spawn` call, typed; fails loudly when nothing spawned. */
function lastSpawnCall(): { binary: string; argv: string[] } {
  const call = spawnMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('no engine spawn happened')
  return { binary: call[0] as string, argv: call[1] as string[] }
}

describe('probeFlat argument construction', () => {
  it('terminates options with `--` and places the URL last', async () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    const url = '--cookies=/hostile/url.txt'
    const probe = probeFlat('yt-dlp-binary', url, []).catch((error: Error) => error)
    // Settle the promise: no JSON on stdout + non-zero close = probe failure.
    child.emitClose(1)
    await probe
    const { binary, argv } = lastSpawnCall()
    expect(binary).toBe('yt-dlp-binary')
    expect(argv.at(-1)).toBe(url)
    expect(argv.at(-2)).toBe('--')
  })

  it('ignores hostiles that appear inside the URL only', async () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    const url = 'https://platform.test/watch?v=abc&utm%5Bcookies%5D=x'
    const probe = probeFlat('bin', url, ['--cookies', '/c.txt']).catch((error: Error) => error)
    child.emitClose(1)
    await probe
    expect(lastSpawnCall().argv.lastIndexOf(url)).toBe(lastSpawnCall().argv.length - 1)
    // Cookie args land before the separator, never after the URL.
    const argv = lastSpawnCall().argv
    expect(argv.indexOf('--cookies')).toBeLessThan(argv.indexOf('--'))
  })

  it('passes probe-only flags without download flags', async () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    const probe = probeFlat('bin', 'https://a/b', []).catch((error: Error) => error)
    child.emitClose(1)
    await probe
    const argv = lastSpawnCall().argv
    expect(argv).toContain('--flat-playlist')
    expect(argv).toContain('--dump-single-json')
    expect(argv).toContain('--no-playlist')
    expect(argv).toContain('--skip-download')
    expect(argv).not.toContain('--ffmpeg-location')
  })
})

describe('spawnYtDlpDownload argument construction', () => {
  const base = {
    binary: 'engine',
    outDir: '/dl',
    url: 'https://platform.test/watch?v=x',
    handlers: silentHandlers,
  }

  it('adds the separator before the URL and the output template second-to-last', () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    spawnYtDlpDownload({ ...base, ffmpegBinary: null, extraArgs: [] })
    const argv = lastSpawnCall().argv
    expect(argv.at(-1)).toBe(base.url)
    expect(argv.at(-2)).toBe('--')
    expect(argv[argv.indexOf('-o') + 1]).toBe(path.join('/dl', '%(title)s [%(id)s].%(ext)s'))
  })

  it('does not pass --ffmpeg-location when ffmpeg is missing', () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    spawnYtDlpDownload({ ...base, ffmpegBinary: null, extraArgs: [] })
    const argv = lastSpawnCall().argv
    expect(argv).not.toContain('--ffmpeg-location')
  })

  it('points --ffmpeg-location at the resolved binary when present', () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    spawnYtDlpDownload({ ...base, ffmpegBinary: '/opt/ffmpeg', extraArgs: [] })
    const argv = lastSpawnCall().argv
    expect(argv[argv.indexOf('--ffmpeg-location') + 1]).toBe('/opt/ffmpeg')
  })

  it('keeps quality/cookie extraArgs before the separator', () => {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    spawnYtDlpDownload({
      ...base,
      ffmpegBinary: '/opt/ffmpeg',
      extraArgs: ['-f', 'bv*+ba/b', '--cookies', '/c.txt'],
    })
    const argv = lastSpawnCall().argv
    for (const flag of ['-f', 'bv*+ba/b', '--cookies', '/c.txt']) {
      const index = argv.indexOf(flag)
      expect(index).toBeGreaterThan(-1)
      expect(index).toBeLessThan(argv.indexOf('--'))
    }
    expect(argv).toContain('--merge-output-format')
  })
})
