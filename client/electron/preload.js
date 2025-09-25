const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  beginDrag: (coords) => ipcRenderer.send('window:drag-start', coords),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  onWindowState: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const handler = (_event, state) => callback(state)
    ipcRenderer.on('window:state', handler)
    return () => ipcRenderer.removeListener('window:state', handler)
  },
})
