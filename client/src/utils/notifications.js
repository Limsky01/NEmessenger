// notifications.js - global/system notifications only
// Exports: showNewMessageNotification(options | author, content, messageId)

function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI
}

let permissionRequested = false
const NOTIFICATION_SETTINGS_KEY = 'nemessenger:notification-settings'

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

const recentShown = new Set()
const RECENT_TTL = 30 * 1000 // 30s
const MAX_BODY_LENGTH = 180
const NOTIFICATION_COOLDOWN_MS = 2200
const BURST_WINDOW_MS = 9000
const BURST_DEBOUNCE_MS = 1500
let lastShownAt = 0
let burstCount = 0
let burstStartedAt = 0
let burstTimer = null
let burstState = null

function markShown(id) {
  if (!id) return
  recentShown.add(id)
  setTimeout(() => recentShown.delete(id), RECENT_TTL)
}

const normalizeOptions = (authorOrOptions, content, messageId) => {
  if (authorOrOptions && typeof authorOrOptions === 'object') return authorOrOptions
  return { author: authorOrOptions, content, messageId }
}

const shouldUseBrowserNotifications = () => {
  if (typeof document === 'undefined') return false
  if (document.hidden) return true
  if (typeof document.hasFocus === 'function') return !document.hasFocus()
  return false
}

const buildPreview = (content) => {
  if (typeof content !== 'string') return 'Нет содержимого'
  const trimmed = content.trim()
  if (!trimmed.length) return 'Нет содержимого'
  if (trimmed.length > MAX_BODY_LENGTH) return `${trimmed.slice(0, MAX_BODY_LENGTH - 3)}...`
  return trimmed
}

const areNotificationsEnabledBySettings = () => {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw)
    if (parsed?.dndEnabled) return false
    if (parsed?.desktopEnabled === false) return false
    return true
  } catch (_) {
    return true
  }
}

const sendSystemNotification = async ({ title, body, silent, showSubtitle, author, messageId, channelId, chatName }) => {
  if (isElectron() && window.electronAPI && typeof window.electronAPI.sendNotification === 'function') {
    try {
      const payload = {
        title,
        body,
        meta: { messageId, channelId, channelName: chatName },
      }
      if (showSubtitle) payload.subtitle = author
      if (silent) payload.silent = true
      window.electronAPI.sendNotification(payload)
      markShown(messageId)
      lastShownAt = Date.now()
      return true
    } catch (err) {
      // fall through to browser notifications
    }
  }

  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return false
  if (!shouldUseBrowserNotifications()) return false

  if (Notification.permission !== 'granted') {
    const ok = await ensureBrowserPermission()
    if (!ok) return false
  }
  new Notification(title, { body, silent })
  markShown(messageId)
  lastShownAt = Date.now()
  return true
}

export async function showNewMessageNotification(arg1, arg2, arg3) {
  try {
    if (!areNotificationsEnabledBySettings()) return false
    const options = normalizeOptions(arg1, arg2, arg3)
    const {
      author: rawAuthor = 'NE Messenger',
      content = '',
      messageId = null,
      channelId = null,
      channelName = null,
      direct = false,
      silent = false,
    } = options

    if (messageId && recentShown.has(messageId)) return false

    const author =
      typeof rawAuthor === 'string' && rawAuthor.trim().length ? rawAuthor.trim() : 'NE Messenger'
    const chatName =
      typeof channelName === 'string' && channelName.trim().length ? channelName.trim() : null
    const preview = buildPreview(content)
    const title = chatName && !direct ? chatName : (chatName || author)
    const showSubtitle = chatName && !direct && chatName !== author
    const body = chatName && !direct ? `${author}: ${preview}` : preview

    if (typeof window !== 'undefined' && window.__NE_DEBUG_NOTIF__) {
      // eslint-disable-next-line no-console
      console.log('[notif] showNewMessageNotification', { title, body, electron: isElectron() })
    }

    const now = Date.now()
    if (!burstStartedAt || now - burstStartedAt > BURST_WINDOW_MS) {
      burstStartedAt = now
      burstCount = 0
      burstState = null
      if (burstTimer) {
        clearTimeout(burstTimer)
        burstTimer = null
      }
    }
    burstCount += 1
    const cooldownActive = now - lastShownAt < NOTIFICATION_COOLDOWN_MS
    const shouldBatch = burstCount > 3 || cooldownActive
    if (shouldBatch) {
      burstState = { title, body, silent, showSubtitle, author, messageId, channelId, chatName }
      if (!burstTimer) {
        burstTimer = setTimeout(() => {
          burstTimer = null
          const pending = burstState
          burstState = null
          if (!pending) return
          const summaryBody = burstCount > 1 ? `${pending.body} (+${burstCount - 1})` : pending.body
          sendSystemNotification({ ...pending, body: summaryBody }).catch(() => {})
          burstCount = 0
          burstStartedAt = 0
        }, BURST_DEBOUNCE_MS)
      }
      return false
    }
    return sendSystemNotification({ title, body, silent, showSubtitle, author, messageId, channelId, chatName })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('showNewMessageNotification error', err)
    return false
  }
}

export default showNewMessageNotification
