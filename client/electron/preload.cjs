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
  sendNotification: (arg1, arg2, arg3) => {
    try {
      let payload
      if (arg1 && typeof arg1 === 'object') {
        payload = { ...arg1 }
      } else {
        payload = { title: arg1, body: arg2 }
        if (arg3 && typeof arg3 === 'object') payload.meta = arg3
      }
      if (!payload.title) payload.title = 'NE Messenger'
      if (!payload.body) payload.body = ''
      ipcRenderer.send('notify', payload)
    } catch (e) {
      ipcRenderer.send('notify', { title: 'NE Messenger', body: '' })
    }
  },
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
  },
  getAutostartStatus: () => ipcRenderer.invoke('autostart:get').catch(() => false),
  setAutostartStatus: (enabled) => ipcRenderer.invoke('autostart:set', Boolean(enabled)),
  isAutostartSupported: () => ipcRenderer.invoke('autostart:is-supported').catch(() => false),
  getBackendUrl: () => ipcRenderer.invoke('backend:get-url').catch(() => null),
  onBackendReady: (cb) => {
    if (typeof cb !== 'function') return () => {}
    const handler = (_event, url) => cb(url)
    ipcRenderer.on('backend:ready', handler)
    return () => ipcRenderer.removeListener('backend:ready', handler)
  },
})
