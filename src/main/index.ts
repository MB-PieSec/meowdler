import { app, BrowserWindow, shell } from 'electron'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'
import { DownloadManager } from './downloads'
import { registerIpcChannels } from './ipc'
import { scheduleStartupUpdateCheck } from './updater'
import { scheduleStartupEngineCheck } from './engine-updater'

/** Catppuccin Mocha `base`, applied before first paint to avoid white flash. */
const WINDOW_BG = '#1e1e2e'

/**
 * Renderer sandbox. Disabled only when the packaged-Linux decision below
 * verdicts the runtime unreliable (AppImage/unpacked layouts) — see the
 * comment at the flip site. deb / macOS / Windows stay fully sandboxed.
 */
let rendererSandboxEnabled = true

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 760,
    minHeight: 520,
    show: true,
    // Frameless: Meowdler draws its own Catppuccin titlebar (Phase 1 shell).
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BG,
    title: 'Meowdler',
    webPreferences: {
      preload: path.join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: rendererSandboxEnabled,
      spellcheck: false,
    },
  })

  // Surface this frameless titlebar must reproduce: keep the renderer's
  // maximize button in sync even when the OS initiated the change (WM
  // shortcuts, double-click, snapping).
  const broadcastMaximized = (): void => {
    void win.webContents.send(IPC_CHANNELS.winMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', broadcastMaximized)
  win.on('unmaximize', broadcastMaximized)

  // Surface renderer load failures instead of failing silently.
  win.webContents.on('did-fail-load', (_event, code, description, url, isMain) => {
    if (isMain) {
      console.error(`Renderer failed to load (${code}): ${description}`, url)
    }
  })

  // Open external links in the user's browser instead of a new Electron window.
  // Only http(s) URLs are ever handed to the OS shell — arbitrary schemes
  // (file:, custom protocol handlers) must never reach openExternal.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-app navigation away from the local renderer (links, history
  // traversal, redirects); remote http(s) targets go to the browser instead.
  const allowNavigation = (url: string): boolean =>
    url.startsWith('file://') ||
    (process.env.ELECTRON_RENDERER_URL !== undefined &&
      url.startsWith(process.env.ELECTRON_RENDERER_URL))
  win.webContents.on('will-navigate', (event, url) => {
    if (allowNavigation(url)) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}

// Must run before `app.ready`: the software renderer in sandboxed/headless-ish
// environments can hang the compositor; hardware acceleration is never needed
// for this UI.
app.disableHardwareAcceleration()

/**
 * Chromium sandbox handling for packaged Linux builds.
 *
 * The `chrome-sandbox` SUID helper next to the executable decides the path:
 *  - deb installs: electron-builder's postinst sets SUID only when user
 *    namespaces are unavailable; otherwise the userns sandbox + shipped
 *    AppArmor profile keep the full sandbox. Never touch the switches here.
 *  - helper missing (or present without SUID outside /opt): AppImage/unpacked
 *    layouts. Node probes userns availability the same way the postinst does;
 *    only disable the sandbox when the helper is genuinely unusable.
 */
if (process.platform === 'linux' && app.isPackaged) {
  const execDir = path.dirname(process.execPath)
  let helperUsable = false
  let helperMissing = false
  try {
    helperUsable = (fs.statSync(path.join(execDir, 'chrome-sandbox')).mode & 0o4000) !== 0
  } catch {
    helperMissing = true
  }

  let noSandbox = false
  if (helperMissing) {
    const probe = spawnSync('unshare', ['--user', 'true'], { stdio: 'ignore' })
    noSandbox = (probe.status ?? 1) !== 0
  } else if (!helperUsable && !execDir.startsWith('/opt/')) {
    // A SUID-less helper aborts the zygote outright (AppImage / unpacked dir).
    noSandbox = true
  }

  if (noSandbox) {
    app.commandLine.appendSwitch('no-sandbox')
    // Electron's sandboxed renderer still tries the Chromium sandboxed
    // launch even with `--no-sandbox` appended, and in this state it dies
    // instantly (FATAL on shared memory → transparent window — shipped as
    // v0.2.7). AppImage/unpacked Linux layouts run the unsandboxed
    // renderer v0.2.6 shipped; the deb (SUID helper) keeps the sandbox.
    rendererSandboxEnabled = false
  }
}

app
  .whenReady()
  .then(() => {
    const downloadManager = new DownloadManager((item) => {
      // Broadcast snapshots to every renderer (usual case: one window).
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.downloadChanged, item)
      }
    })
    registerIpcChannels(downloadManager)
    createMainWindow()
    scheduleStartupUpdateCheck(() => BrowserWindow.getAllWindows()[0])
    // Quiet yt-dlp engine freshness check; never dialog, never blocks.
    scheduleStartupEngineCheck()

    // macOS keeps the process alive with a fresh window; every other OS quits.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
  .catch((reason: unknown) => {
    app.quit()
    console.error('Fatal: app failed to initialize:', reason)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
