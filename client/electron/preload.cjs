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
  sendNotification: (title, body, meta = {}) => {
    try {
      const payload = { title, body }
      if (meta && typeof meta === 'object') payload.meta = meta
      ipcRenderer.send('notify', payload)
    } catch (e) {
      ipcRenderer.send('notify', { title, body })
    }
  }
  ,
  testNotify: (title = 'Test', body = 'Test body', messageId = null) => {
    const payload = { title, body }
    if (messageId) payload.meta = { messageId }
    ipcRenderer.send('notify', payload)
  },
  onNotifyAck: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('notify:ack', handler)
    return () => ipcRenderer.removeListener('notify:ack', handler)
  },
  onNotifyClick: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_e, payload) => cb(payload)
    ipcRenderer.on('notify:click', handler)
    return () => ipcRenderer.removeListener('notify:click', handler)
  }
})
