import { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win = null
let tray = null
let forceQuit = false
let updaterInitialized = false
let updateCheckInProgress = false
let updateDownloadInProgress = false
let lastUpdateStatus = null

const buildUpdateStatusPayload = (status, extra = {}) => ({
  status,
  timestamp: Date.now(),
  ...extra,
})

const broadcastUpdateStatus = (status, extra = {}) => {
  const payload = buildUpdateStatusPayload(status, extra)
  lastUpdateStatus = payload
  const targets = BrowserWindow.getAllWindows()
  for (const target of targets) {
    try {
      if (target?.webContents && !target.webContents.isDestroyed()) {
        target.webContents.send('update:status', payload)
      }
    } catch (error) {
      console.warn('[main] failed to send update status', error)
    }
  }
}

const initializeAutoUpdater = () => {
  if (updaterInitialized) return
  updaterInitialized = true

  if (!app.isPackaged) {
    broadcastUpdateStatus('disabled', { reason: 'development' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    updateCheckInProgress = true
    broadcastUpdateStatus('checking')
  })

  autoUpdater.on('update-available', (info) => {
    updateCheckInProgress = false
    broadcastUpdateStatus('available', { info, autoDownload: autoUpdater.autoDownload })
  })

  autoUpdater.on('update-not-available', (info) => {
    updateCheckInProgress = false
    broadcastUpdateStatus('not-available', { info })
  })

  autoUpdater.on('download-progress', (progress) => {
    updateDownloadInProgress = true
    broadcastUpdateStatus('downloading', { progress })
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloadInProgress = false
    broadcastUpdateStatus('downloaded', { info })
  })

  autoUpdater.on('error', (error) => {
    updateCheckInProgress = false
    updateDownloadInProgress = false
    const message = error instanceof Error ? error.message : String(error)
    broadcastUpdateStatus('error', { message })
  })

  autoUpdater.on('update-cancelled', () => {
    updateDownloadInProgress = false
    broadcastUpdateStatus('cancelled')
  })
}

const resolveFirstExistingPath = (candidates = []) => {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue
    try {
      if (fs.existsSync(candidate)) return candidate
    } catch (e) {}
  }
  return null
}

const loadTrayIcon = () => {
  const iconPath = resolveFirstExistingPath([
    path.join(__dirname, 'assets', 'tray.png'),
    path.join(__dirname, '../assets', 'tray.png'),
    path.join(process.resourcesPath || '', 'assets', 'tray.png'),
  ])
  if (iconPath) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) {
      if (process.platform === 'darwin') image.setTemplateImage(true)
      return image
    }
  }
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAQAAABWESUoAAAAN0lEQVR42u3OMQ0AIBDAwAriAfx/nZkMNCaVWmBkT6UTzp0bPzHwOImg0JBoNCRaDwkGg0JFY4/1ZAAqJJ5qjj/zfAAAAAElFTkSuQmCC'
  )
  if (process.platform === 'darwin') fallback.setTemplateImage(true)
  return fallback
}

const showWindow = () => {
  if (!win) return
  win.setSkipTaskbar(false)
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (process.platform === 'darwin' && app.dock) app.dock.show()
}

const hideWindowToTray = () => {
  if (!win) return
  if (!tray) createTray()
  win.hide()
  win.setSkipTaskbar(true)
  if (process.platform === 'darwin' && app.dock) app.dock.hide()
}

const createTray = () => {
  if (tray) return tray
  const trayIcon = loadTrayIcon()
  tray = new Tray(trayIcon)
  tray.setToolTip('NE Messenger')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => showWindow(),
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        forceQuit = true
        if (tray) {
          tray.destroy()
          tray = null
        }
        app.quit()
      },
    },
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', () => showWindow())
  tray.on('double-click', () => showWindow())
  return tray
}

const isAutostartSupported = () => {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return false
  return typeof app.getLoginItemSettings === 'function' && typeof app.setLoginItemSettings === 'function'
}

const getAutostartEnabled = () => {
  if (!isAutostartSupported()) return false
  try {
    const settings = app.getLoginItemSettings()
    return Boolean(settings?.openAtLogin)
  } catch (err) {
    console.warn('[main] getLoginItemSettings failed', err)
    return false
  }
}

const setAutostartEnabled = (enabled) => {
  if (!isAutostartSupported()) return false
  try {
    const options = { openAtLogin: Boolean(enabled) }
    if (process.platform === 'win32') {
      options.path = process.execPath
      options.args = []
    }
    app.setLoginItemSettings(options)
    return getAutostartEnabled()
  } catch (err) {
    console.warn('[main] setLoginItemSettings failed', err)
    throw err
  }
}

const normalizeNotificationPayload = (raw) => {
  if (raw && typeof raw === 'object') {
    return {
      title: typeof raw.title === 'string' && raw.title.length ? raw.title : 'NE Messenger',
      body: typeof raw.body === 'string' ? raw.body : '',
      subtitle: typeof raw.subtitle === 'string' && raw.subtitle.trim().length ? raw.subtitle : '',
      silent: Boolean(raw.silent),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {},
    }
  }
  return {
    title: typeof raw === 'string' && raw.length ? raw : 'NE Messenger',
    body: '',
    subtitle: '',
    silent: false,
    meta: {},
  }
}

const getWindowState = () => ({
  maximized: win?.isMaximized() ?? false,
  fullscreen: win?.isFullScreen() ?? false,
})

const sendWindowState = () => {
  if (!win) return
  win.webContents.send('window:state', getWindowState())
}

const registerIpcHandlers = () => {
  initializeAutoUpdater()

  ipcMain.removeHandler('window:get-state')
  ipcMain.removeAllListeners('window:minimize')
  ipcMain.removeAllListeners('window:toggle-maximize')
  ipcMain.removeAllListeners('window:close')
  ipcMain.removeAllListeners('window:drag-start')
  ipcMain.removeHandler('autostart:get')
  ipcMain.removeHandler('autostart:set')
  ipcMain.removeHandler('autostart:is-supported')
  ipcMain.removeHandler('app:get-version')
  ipcMain.removeHandler('update:check')
  ipcMain.removeHandler('update:download')
  ipcMain.removeHandler('update:install')
  ipcMain.removeHandler('update:get-status')
  ipcMain.removeAllListeners('notify')

  ipcMain.handle('window:get-state', () => getWindowState())
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('update:get-status', () => lastUpdateStatus)
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      broadcastUpdateStatus('disabled', { reason: 'development' })
      return { ok: false, reason: 'development' }
    }
    if (updateCheckInProgress) return { ok: true, inProgress: true }
    try {
      updateCheckInProgress = true
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, info: result?.updateInfo ?? null }
    } catch (error) {
      updateCheckInProgress = false
      const message = error instanceof Error ? error.message : String(error)
      broadcastUpdateStatus('error', { message })
      return { ok: false, error: message }
    }
  })
  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) {
      broadcastUpdateStatus('disabled', { reason: 'development' })
      return { ok: false, reason: 'development' }
    }
    if (updateDownloadInProgress) return { ok: true, inProgress: true }
    try {
      updateDownloadInProgress = true
      const downloadedFile = await autoUpdater.downloadUpdate()
      return { ok: true, downloadedFile }
    } catch (error) {
      updateDownloadInProgress = false
      const message = error instanceof Error ? error.message : String(error)
      broadcastUpdateStatus('error', { message })
      return { ok: false, error: message }
    }
  })
  ipcMain.handle('update:install', () => {
    if (!app.isPackaged) {
      broadcastUpdateStatus('disabled', { reason: 'development' })
      return { ok: false, reason: 'development' }
    }
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(true, true)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        broadcastUpdateStatus('error', { message })
      }
    })
    return { ok: true }
  })

  ipcMain.on('window:minimize', () => {
    win?.minimize()
  })

  ipcMain.on('window:toggle-maximize', () => {
    if (!win) return
    if (win.isFullScreen()) {
      win.setFullScreen(false)
    } else if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    sendWindowState()
  })

  ipcMain.on('window:close', () => {
    if (!win) return
    hideWindowToTray()
  })

  ipcMain.on('window:drag-start', (_event, coords = {}) => {
    if (!win || !win.isMaximized()) return
    const rawX = Number(coords.screenX)
    const rawY = Number(coords.screenY)
    const [width, height] = win.getSize()
    const targetX = Number.isFinite(rawX) ? Math.round(rawX - width / 2) : null
    const targetY = Number.isFinite(rawY) ? Math.round(rawY - Math.min(40, Math.max(24, height * 0.08))) : null
    const reposition = () => {
      if (!win) return
      if (Number.isFinite(targetX) && Number.isFinite(targetY)) win.setPosition(targetX, targetY, false)
      sendWindowState()
    }
    win.once('unmaximize', reposition)
    win.unmaximize()
  })

  ipcMain.handle('autostart:is-supported', () => isAutostartSupported())
  ipcMain.handle('autostart:get', () => getAutostartEnabled())
  ipcMain.handle('autostart:set', (_event, enabled) => setAutostartEnabled(Boolean(enabled)))

  // Global notification IPC handler used by renderer via preload
  ipcMain.on('notify', (_event, rawPayload) => {
    const payload = normalizeNotificationPayload(rawPayload)
    const { title, body, subtitle, silent, meta } = payload
    console.log('[main] notify ipc received:', payload)
    try {
      const focused = BrowserWindow.getAllWindows().some((w) => w.isFocused())
      if (focused) {
        console.log('[main] windows focused - skipping system notification')
        try { _event.sender && _event.sender.send('notify:ack', { shown: false, reason: 'focused', meta }) } catch (e) {}
        return
      }
      const noteOptions = { title, body }
      if (subtitle) noteOptions.subtitle = subtitle
      if (silent) noteOptions.silent = true
      const note = new Notification(noteOptions)
      note.show()
      try { _event.sender && _event.sender.send('notify:ack', { shown: true, meta }) } catch (e) {}
      console.log('[main] system notification shown')
      note.on('click', () => {
        try {
          const fromWin = BrowserWindow.fromWebContents(_event.sender) || BrowserWindow.getAllWindows()[0]
          if (fromWin) fromWin.focus()
        } catch (e) {}
        try { _event.sender && _event.sender.send('notify:click', { meta }) } catch (e) {}
      })
    } catch (err) {
      console.error('[main] notify handler error', err)
      try { _event.sender && _event.sender.send('notify:ack', { shown: false, error: String(err), meta }) } catch (e) {}
    }
  })
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    transparent: isMac,
    backgroundColor: '#00000000',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    minimizable: true,
    maximizable: true,
    movable: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  const startUrl = process.env.ELECTRON_START_URL
  if (startUrl) win.loadURL(startUrl)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'))

  registerIpcHandlers()

  win.webContents.once('did-finish-load', () => {
    if (!lastUpdateStatus) return
    try {
      if (!win?.webContents?.isDestroyed()) {
        win.webContents.send('update:status', lastUpdateStatus)
      }
    } catch (error) {
      console.warn('[main] unable to send initial update status', error)
    }
  })

  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)
  win.on('enter-full-screen', sendWindowState)
  win.on('leave-full-screen', sendWindowState)
  win.on('minimize', (event) => {
    event.preventDefault()
    hideWindowToTray()
  })
  win.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault()
      hideWindowToTray()
      return
    }
    if (tray) {
      tray.destroy()
      tray = null
    }
    win = null
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  initializeAutoUpdater()
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater
        .checkForUpdates()
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          broadcastUpdateStatus('error', { message })
        })
    }, 3000)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  forceQuit = true
  if (tray) {
    tray.destroy()
    tray = null
  }
})

