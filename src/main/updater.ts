import { app, dialog, shell, type BrowserWindow } from 'electron'
import updaterPackage from 'electron-updater'
import type { UpdateCheckOutcome } from '../shared/ipc'

/**
 * electron-updater is CommonJS while our main bundle is ESM: pull the client
 * off the default export after interop (the named-import form is rejected at
 * runtime by node's ESM loader).
 */
const { autoUpdater } = updaterPackage

/**
 * Update flow over GitHub Releases (electron-updater, publish feed from the
 * build config). Startup checks prompt the user; the titlebar button repeats
 * the same check on demand.
 *
 * Behaviors per environment:
 *  - dev            → never prompts; `mode: 'dev'`
 *  - deb / tarball  → feed is still probed, but "install" opens the releases
 *                     page (those formats cannot self-update safely)
 *  - nsis / dmg|zip / AppImage → download + relaunch on consent
 */

export const RELEASES_PAGE_URL = 'https://github.com/MB-PieSec/meowdler/releases/latest'

const STARTUP_CHECK_DELAY_MS = 4000

let inFlight = false

/** Formats electron-updater can install in place. */
function supportsSelfInstall(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'darwin') return true
  if (process.platform === 'linux') {
    return process.env.APPIMAGE !== undefined || process.env.SNAP !== undefined
  }
  return false
}

function simpleCompareGreater(latest: string, current: string): boolean {
  const l = latest.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const c = current.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i += 1) {
    const ln = l.at(i) ?? 0
    const cn = c.at(i) ?? 0
    if (ln !== cn) return ln > cn
  }
  return false
}

async function promptAndInstall(
  latestVersion: string,
  parent: BrowserWindow | undefined,
): Promise<boolean> {
  const doubleButton = supportsSelfInstall()
  const options = {
    type: 'info',
    title: 'Update Meowdler',
    message: `Meowdler ${latestVersion} is available (you have ${app.getVersion()}).`,
    buttons: doubleButton ? ['Update', 'Not now'] : ['Open releases page', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  } as const
  const answer = await (parent === undefined
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(parent, options))

  if (answer.response !== 0) return false
  if (supportsSelfInstall()) {
    // autoDownload is off, so consent routes through the explicit download.
    await autoUpdater.downloadUpdate()
    autoUpdater.quitAndInstall(false, true)
    return true
  }
  await shell.openExternal(RELEASES_PAGE_URL)
  return false
}

/**
 * One update check. `prompt` decides whether a found update raises the
 * native dialog (startup + button both use true).
 */
export async function runUpdateCheck(
  prompt: boolean,
  parent?: BrowserWindow,
): Promise<UpdateCheckOutcome> {
  const currentVersion = app.getVersion()
  const base = { currentVersion, latestVersion: null, installing: false, error: null }

  if (!app.isPackaged) {
    return { ...base, mode: 'dev' }
  }
  if (inFlight) {
    return { ...base, mode: 'error', error: 'An update check is already running' }
  }
  inFlight = true
  try {
    autoUpdater.autoDownload = false
    autoUpdater.allowPrerelease = false
    autoUpdater.autoInstallOnAppQuit = true

    const result = (await autoUpdater.checkForUpdates()) as {
      isUpdateAvailable?: boolean
      updateInfo?: { version?: string }
    }
    const latestVersion = result.updateInfo?.version ?? null
    if (latestVersion === null) {
      return { ...base, mode: 'up-to-date' }
    }
    const available =
      result.isUpdateAvailable ?? simpleCompareGreater(latestVersion, currentVersion)

    if (!available) {
      return { ...base, mode: 'up-to-date' }
    }

    const installing = prompt === true ? await promptAndInstall(latestVersion, parent) : false
    return {
      ...base,
      mode: 'available',
      latestVersion,
      installing,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Formats without updater support can fail at feed probing itself —
    // surface that as 'unsupported' instead of a raw error.
    const unsupported = /not supported|no such file|ENOENT.*app-update/i.test(message)
    return {
      ...base,
      mode: unsupported ? 'unsupported' : 'error',
      error: unsupported ? null : message,
    }
  } finally {
    inFlight = false
  }
}

/** Schedules the startup prompt once main is ready to accept dialogs. */
export function scheduleStartupUpdateCheck(getWindow: () => BrowserWindow | undefined): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    void runUpdateCheck(true, getWindow()).catch(() => {})
  }, STARTUP_CHECK_DELAY_MS).unref()
}
