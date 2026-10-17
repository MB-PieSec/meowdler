/**
 * Unit tests for the pure engine-updater helpers in `src/main/engine-updater.ts`:
 * the per-segment version compare and the per-platform release asset name.
 * Electron is mocked (the module only imports it at module scope).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/virtual/app',
    getPath: () => '/virtual/userdata',
  },
}))

import { engineAssetName, versionGreater } from '../../src/main/engine-updater'

describe('versionGreater (date-style engine tags)', () => {
  it('detects a strictly newer release', () => {
    expect(versionGreater('2026.08.19', '2026.08.19')).toBe(false)
    expect(versionGreater('2026.08.20', '2026.08.19')).toBe(true)
    expect(versionGreater('2026.09.01', '2026.08.19')).toBe(true)
    expect(versionGreater('2027.01.01', '2026.08.19')).toBe(true)
  })
  it('rejects an equal or older release', () => {
    expect(versionGreater('2026.08.19', '2026.08.19')).toBe(false)
    expect(versionGreater('2026.08.18', '2026.08.19')).toBe(false)
    expect(versionGreater('2025.12.31', '2026.08.19')).toBe(false)
  })
  it('compares segment-wise, not lexically', () => {
    // Lexical order would rank 2026.9.0 (a different style) wrong; these are
    // date-style tags so padding is uniform in practice — the test pins the
    // numeric meaning of uneven segments.
    expect(versionGreater('2026.10.01', '2026.9.30')).toBe(true)
  })
  it('tolerates a leading v prefix on either side', () => {
    expect(versionGreater('v2026.08.20', '2026.08.19')).toBe(true)
    expect(versionGreater('2026.08.20', 'v2026.08.19')).toBe(true)
  })
  it('treats missing trailing segments as zero', () => {
    expect(versionGreater('2026.08', '2026.08.01')).toBe(false)
    expect(versionGreater('2026.08.02', '2026.08')).toBe(true)
  })
})

describe('engineAssetName (official release asset per platform)', () => {
  const realPlatform = process.platform
  /** Stubbing process.platform is process-global; capture + restore exactly. */
  const platformStub = (platform: NodeJS.Platform): void => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  }

  afterEach(() => {
    platformStub(realPlatform)
  })

  it('returns the Windows executable asset', () => {
    platformStub('win32')
    expect(engineAssetName()).toBe('yt-dlp.exe')
  })
  it('returns the universal macOS binary asset', () => {
    platformStub('darwin')
    expect(engineAssetName()).toBe('yt-dlp_macos')
  })
  it('returns the Linux binary asset elsewhere', () => {
    platformStub('linux')
    expect(engineAssetName()).toBe('yt-dlp_linux')
  })
})
