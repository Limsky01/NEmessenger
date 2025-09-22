import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'; import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url); const __dirname = path.dirname(__filename);
let win
function createWindow(){
  const isMac = process.platform==='darwin'
  win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 1100, minHeight: 720,
    frame: false, transparent: isMac, backgroundColor: '#00000000',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname,'preload.js') }
  })
  const url = process.env.ELECTRON_START_URL
  if (url) win.loadURL(url); else win.loadFile(path.join(__dirname,'../dist/index.html'))
  ipcMain.on('window:minimize', ()=>win.minimize())
  ipcMain.on('window:maximize', ()=> win.isMaximized()? win.unmaximize(): win.maximize())
  ipcMain.on('window:close', ()=>win.close())
}
app.whenReady().then(()=>{ createWindow(); app.on('activate',()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow() }) })
app.on('window-all-closed', ()=>{ if(process.platform!=='darwin') app.quit() })
