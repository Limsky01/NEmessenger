let contextBridge, ipcRenderer;
try {
    ({ contextBridge, ipcRenderer } = require('electron')) } catch (_) {}
if (!contextBridge) {
    const electron = await
    import ('electron');
    contextBridge = electron.contextBridge;
    ipcRenderer = electron.ipcRenderer;
}
contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
});