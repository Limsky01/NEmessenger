import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win = null
let backendInfo = null
let backendModule = null
let backendStartPromise = null
let backendStopPromise = null
let backendUrl = null

const DEFAULT_BACKEND_HOST = '127.0.0.1'
const DEFAULT_BACKEND_PORT = 48080

const resolveServerRoot = () => {
  if (app?.isPackaged) {
    return path.join(process.resourcesPath, 'server')
  }
  return path.resolve(__dirname, '..', '..', 'server')
}

const loadEnvFile = (filePath) => {
  const env = {}
  try {
    if (!fs.existsSync(filePath)) return env
    const raw = fs.readFileSync(filePath, 'utf8')
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const eqIndex = line.indexOf('=')
        if (eqIndex <= 0) return
        const key = line.slice(0, eqIndex).trim()
        const value = line.slice(eqIndex + 1).trim()
        if (key) env[key] = value
      })
  } catch (err) {
    console.warn('[main] failed to load env file', filePath, err)
  }
  return env
}

const readPersistedBackendConfig = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (err) {
    console.warn('[main] failed to read backend config', err)
  }
  return {}
}

const writePersistedBackendConfig = (filePath, config) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
  } catch (err) {
    console.warn('[main] failed to persist backend config', err)
  }
}

const notifyBackendReady = (url) => {
  if (!url) return
  backendUrl = url
  BrowserWindow.getAllWindows().forEach((window) => {
    try {
      window.webContents.send('backend:ready', url)
    } catch (err) {
      console.warn('[main] failed to notify backend ready', err)
    }
  })
}

const ensureBackend = async () => {
  if (backendInfo) return backendInfo
  if (backendStartPromise) return backendStartPromise

  backendStartPromise = (async () => {
    const serverRoot = resolveServerRoot()
    const envFromFile = loadEnvFile(path.join(serverRoot, '.env'))
    const dataRoot = path.join(app.getPath('userData'), 'backend')
    fs.mkdirSync(dataRoot, { recursive: true })

    const bundledDbPath = path.join(serverRoot, 'messenger_v4.db')
    const targetDbPath = path.join(dataRoot, 'messenger_v4.db')
    try {
      if (!fs.existsSync(targetDbPath) && fs.existsSync(bundledDbPath)) {
        fs.copyFileSync(bundledDbPath, targetDbPath)
      }
    } catch (err) {
      console.warn('[main] failed to prepare bundled database', err)
    }

    const persistedConfigPath = path.join(dataRoot, 'config.json')
    const persisted = readPersistedBackendConfig(persistedConfigPath)

    const host = process.env.NE_BACKEND_HOST || persisted.host || envFromFile.HOST || DEFAULT_BACKEND_HOST
    const port = Number(process.env.NE_BACKEND_PORT || persisted.port || envFromFile.PORT || DEFAULT_BACKEND_PORT)

    const encryptionKey =
      process.env.ENCRYPTION_KEY || persisted.encryptionKey || envFromFile.ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64')
    const jwtSecret = process.env.JWT_SECRET || persisted.jwtSecret || envFromFile.JWT_SECRET || crypto.randomBytes(32).toString('base64')

    const uploadsDir = path.join(dataRoot, 'uploads')
    fs.mkdirSync(uploadsDir, { recursive: true })

    process.env.NE_MESSENGER_DATA_ROOT = dataRoot
    process.env.PORT = String(port)
    process.env.JWT_SECRET = jwtSecret
    process.env.ENCRYPTION_KEY = encryptionKey
    process.env.UPLOAD_DIR = uploadsDir

    const moduleUrl = pathToFileURL(path.join(serverRoot, 'src/index.js')).href
    const mod = await import(moduleUrl)
    if (typeof mod.startMessengerServer !== 'function') {
      throw new Error('startMessengerServer export not found')
    }
    backendModule = mod
    const result = await mod.startMessengerServer({ host, port })
    const resolvedPort = result?.port ?? port
    const resolvedHost = result?.host ?? host
    backendInfo = { ...result, port: resolvedPort, host: resolvedHost }
    const baseUrl = `http://${resolvedHost}:${resolvedPort}`
    backendInfo.url = baseUrl
    writePersistedBackendConfig(persistedConfigPath, {
      host: resolvedHost,
      port: resolvedPort,
      encryptionKey,
      jwtSecret,
    })
    notifyBackendReady(baseUrl)
    return backendInfo
  })()

  try {
    return await backendStartPromise
  } finally {
    backendStartPromise = null
  }
}

const stopBackend = async () => {
  if (backendStopPromise) return backendStopPromise
  if (!backendModule?.stopMessengerServer) return Promise.resolve(null)
  backendStopPromise = backendModule
    .stopMessengerServer()
    .catch((err) => {
      console.warn('[main] failed to stop backend', err)
    })
    .finally(() => {
      backendStopPromise = null
      backendInfo = null
      backendModule = null
      backendUrl = null
    })
  return backendStopPromise
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
  ipcMain.removeHandler('window:get-state')
  ipcMain.removeAllListeners('window:minimize')
  ipcMain.removeAllListeners('window:toggle-maximize')
  ipcMain.removeAllListeners('window:close')
  ipcMain.removeAllListeners('window:drag-start')
  ipcMain.removeHandler('autostart:get')
  ipcMain.removeHandler('autostart:set')
  ipcMain.removeHandler('autostart:is-supported')
  ipcMain.removeHandler('backend:get-url')

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
  ipcMain.handle('backend:get-url', async () => {
    try {
      const info = await ensureBackend()
      return info?.url ?? backendUrl ?? null
    } catch (err) {
      console.error('[main] backend:get-url failed', err)
      return backendUrl ?? null
    }
  })

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

  if (backendUrl) {
    win.webContents.once('did-finish-load', () => {
      try {
        win?.webContents.send('backend:ready', backendUrl)
      } catch (err) {
        console.warn('[main] failed to deliver backend url to renderer', err)
      }
    })
  }

  ensureBackend()
    .then((info) => {
      if (!info?.url) return
      try {
        win?.webContents.send('backend:ready', info.url)
      } catch (err) {
        console.warn('[main] failed to send backend url after init', err)
      }
    })
    .catch((err) => {
      console.error('[main] ensureBackend during window init failed', err)
    })

  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)
  win.on('enter-full-screen', sendWindowState)
  win.on('leave-full-screen', sendWindowState)
  win.on('close', () => {
    win = null
  })
}

app.whenReady().then(async () => {
  try {
    await ensureBackend()
  } catch (err) {
    console.error('[main] failed to start backend', err)
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  stopBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

