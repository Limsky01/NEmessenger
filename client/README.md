# Liquid Glass Messenger — Client (Electron + React)

## Quick start (dev)
1) `cd client`
2) `npm i`
3) Start your server (default: http://localhost:4000)
4) `npm run dev` (Vite) and in another terminal: `npm run start` (Electron) — or set `ELECTRON_START_URL=http://localhost:5173`

## Build installers
- Windows: `npm run build` → dist/*.exe
- macOS: `npm run build` → dist/*.dmg
- Linux: `npm run build` → dist/*.AppImage

To point the client at a remote server, set env before build:
```bash
set LGM_SERVER=https://your-server.com   # Windows (cmd)
export LGM_SERVER=https://your-server.com # macOS/Linux
```

## Font
- Replace `assets/fonts/Minecraftia.ttf` with the real font file to get the Minecraft look.
