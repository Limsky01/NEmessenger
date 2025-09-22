// CommonJS preload: доступен при contextIsolation: true
const { contextBridge, ipcRenderer } = require('electron')

// безопасный мост
contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
})