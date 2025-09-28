// notifications.js — global/system notifications only
// Exports: showNewMessageNotification(author, content)

function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI
}

let permissionRequested = false

async function ensureBrowserPermission() {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  if (permissionRequested) return false
  try {
    permissionRequested = true
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch (e) {
    return false
  }
}

export async function showNewMessageNotification(author, content) {
  try {
    const title = `Новое сообщение от ${author}`
    const body = typeof content === 'string' ? (content.length > 120 ? `${content.slice(0, 117)}...` : content) : ''

    // Debug log (enable in DevTools with window.__NE_DEBUG_NOTIF__ = true)
    if (typeof window !== 'undefined' && window.__NE_DEBUG_NOTIF__) {
      // eslint-disable-next-line no-console
      console.log('[notif] showNewMessageNotification', { title, body, electron: isElectron() })
    }

    // If running in Electron with a preload bridge — use it.
    if (isElectron()) {
      try {
        // sendNotification is synchronous fire-and-forget; no need to await
        if (window.electronAPI && typeof window.electronAPI.sendNotification === 'function') {
          window.electronAPI.sendNotification(title, body)
          return true
        }
      } catch (err) {
        // fallthrough to browser Notification API
      }
    }

    // Fallback: Browser Notification API
    if (typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
        return true
      }
      // If not denied, request once
      const ok = await ensureBrowserPermission()
      if (ok) {
        new Notification(title, { body })
        return true
      }
    }

    return false
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('showNewMessageNotification error', err)
    return false
  }
}

export default showNewMessageNotification
