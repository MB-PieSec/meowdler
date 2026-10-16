import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc'
import { DownloadManager } from './downloads'
import { registerIpcChannels } from './ipc'

/** Catppuccin Mocha `base`, applied before first paint to avoid white flash. */
const WINDOW_BG = '#1e1e2e'

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
      preload: path.join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
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
