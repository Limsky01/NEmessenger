import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win = null

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
  ipcMain.removeHandler('window:get-state')
  ipcMain.removeAllListeners('window:minimize')
  ipcMain.removeAllListeners('window:toggle-maximize')
  ipcMain.removeAllListeners('window:close')
  ipcMain.removeAllListeners('window:drag-start')
  ipcMain.removeHandler('autostart:get')
  ipcMain.removeHandler('autostart:set')
  ipcMain.removeHandler('autostart:is-supported')

  ipcMain.handle('window:get-state', () => getWindowState())

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
    win?.close()
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

  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)
  win.on('enter-full-screen', sendWindowState)
  win.on('leave-full-screen', sendWindowState)
  win.on('close', () => {
    win = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

