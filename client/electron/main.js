import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let win = null

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
      preload: path.join(__dirname, 'preload.js'),
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

