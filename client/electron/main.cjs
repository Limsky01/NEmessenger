import { autoUpdater } from 'electron-updater'
const { app, BrowserWindow, ipcMain, Notification } = require("electron");
const path = require("path");

let win;

function createWindow() {
    const isMac = process.platform === "darwin";

    win = new BrowserWindow({
        width: 1240,
        height: 820,
        minWidth: 1000,
        minHeight: 700,
        frame: false,
        transparent: false,
        backgroundColor: "#00000000",
        titleBarStyle: isMac ? "hiddenInset" : "hidden",
        webPreferences: {
            contextIsolation: true,
            sandbox: false,
        preload: path.join(__dirname, "preload.cjs")
        }
    });

    const startURL = process.env.ELECTRON_START_URL;
    if (startURL) {
        win.loadURL(startURL);
    } else {
        win.loadFile(path.join(__dirname, "../dist/index.html"));
    }

    ipcMain.on("window:minimize", () => win.minimize());
    ipcMain.on("window:maximize", () => {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
    });
    ipcMain.on("window:close", () => win.close());

    ipcMain.on('notify', (_, { title, body }) => {
        console.log('[main] notify ipc received:', { title, body });
        try {
            if (BrowserWindow.getAllWindows().some(w => w.isFocused())) {
                console.log('[main] windows focused — skipping system notification');
                return;
            }
            const note = new Notification({ title, body });
            note.show();
            console.log('[main] system notification shown');
        } catch (err) {
            console.error('[main] notify handler error', err);
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        autoUpdater.checkForUpdatesAndNotify()
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});