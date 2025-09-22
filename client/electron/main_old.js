import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const electronModule = require("electron");
console.log("electron module keys", Object.keys(electronModule));

const { app, BrowserWindow, ipcMain } = electronModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      preload: path.join(__dirname, "preload.js")
    }
  });

  const startURL = process.env.ELECTRON_START_URL;
  if (startURL) win.loadURL(startURL);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));

  ipcMain.on("window:minimize", () => win.minimize());
  ipcMain.on("window:maximize", () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on("window:close", () => win.close());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
