import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'
import { showNewMessageNotification } from '../utils/notifications'

const encoder = new TextEncoder()
const storageKeyForChannel = (cid) => `chkey:${cid}`
const APPEARANCE_STORAGE_KEY = 'nemessenger:appearance'
const AUTH_STORAGE_KEY = 'nemessenger:auth'
const USER_STATUS_KEY = 'nemessenger:user-status'
const NAME_STYLE_KEY = 'nemessenger:name-style'
const PROFILE_STATUS_KEY = 'nemessenger:profile-status'
const PROFILE_BACKGROUND_KEY = 'nemessenger:profile-background'
const SERVER_URL_KEY = 'nemessenger:server-url'
const DEFAULT_APPEARANCE = Object.freeze({
  backgroundMode: 'gradient',
  gradient: { angle: 135, colors: ['#11131f', '#090a0f', '#141b2d'] },
  backgroundImage: { dataUrl: '', brightness: 0.4, blur: 18, vignette: 0.35 },
  solidColor: '#0b0d13',
  accent: '#8ec5ff',
  glassOpacity: 0.12,
  panelOpacity: 0.18,
  noiseStrength: 0.12,
})
const DEFAULT_NAME_STYLE = Object.freeze({
  font: 'rubik',
  effect: 'minimal',
  color: '#8ec5ff',
})

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

const cloneAppearance = (value = DEFAULT_APPEARANCE) => ({
  backgroundMode: value.backgroundMode,
  gradient: {
    angle: value.gradient?.angle ?? DEFAULT_APPEARANCE.gradient.angle,
    colors: Array.isArray(value.gradient?.colors) ? [...value.gradient.colors] : [...DEFAULT_APPEARANCE.gradient.colors],
  },
  backgroundImage: {
    dataUrl: value.backgroundImage?.dataUrl ?? '',
    brightness: value.backgroundImage?.brightness ?? DEFAULT_APPEARANCE.backgroundImage.brightness,
    blur: value.backgroundImage?.blur ?? DEFAULT_APPEARANCE.backgroundImage.blur,
    vignette: value.backgroundImage?.vignette ?? DEFAULT_APPEARANCE.backgroundImage.vignette,
  },
  solidColor: value.solidColor,
  accent: value.accent,
  glassOpacity: value.glassOpacity,
  panelOpacity: value.panelOpacity,
  noiseStrength: value.noiseStrength,
})

const normalizeAppearance = (value = DEFAULT_APPEARANCE) => {
  const base = cloneAppearance(value)
  const backgroundMode = base.backgroundMode === 'image' || base.backgroundMode === 'solid' ? base.backgroundMode : 'gradient'
  const colors = Array.isArray(base.gradient.colors) && base.gradient.colors.length
    ? base.gradient.colors.filter((color) => typeof color === 'string' && color.trim()).slice(0, 4)
    : [...DEFAULT_APPEARANCE.gradient.colors]
  const angle = clamp(base.gradient.angle ?? DEFAULT_APPEARANCE.gradient.angle, 0, 360)
  const backgroundImage = {
    dataUrl: typeof base.backgroundImage.dataUrl === 'string' ? base.backgroundImage.dataUrl : '',
    brightness: clamp(base.backgroundImage.brightness ?? DEFAULT_APPEARANCE.backgroundImage.brightness, 0, 1),
    blur: clamp(base.backgroundImage.blur ?? DEFAULT_APPEARANCE.backgroundImage.blur, 0, 40),
    vignette: clamp(base.backgroundImage.vignette ?? DEFAULT_APPEARANCE.backgroundImage.vignette, 0, 1),
  }
  const solidColor = typeof base.solidColor === 'string' && base.solidColor.trim().length
    ? base.solidColor.trim()
    : DEFAULT_APPEARANCE.solidColor
  const accent = typeof base.accent === 'string' && base.accent.trim().length ? base.accent.trim() : DEFAULT_APPEARANCE.accent
  const glassOpacity = clamp(base.glassOpacity ?? DEFAULT_APPEARANCE.glassOpacity, 0.02, 0.5)
  const panelOpacity = clamp(base.panelOpacity ?? DEFAULT_APPEARANCE.panelOpacity, 0.05, 0.65)
  const noiseStrength = clamp(base.noiseStrength ?? DEFAULT_APPEARANCE.noiseStrength, 0, 0.4)
  return {
    backgroundMode,
    gradient: { angle, colors },
    backgroundImage,
    solidColor,
    accent,
    glassOpacity,
    panelOpacity,
    noiseStrength,
  }
}

const loadAppearance = () => {
  if (typeof window === 'undefined') return normalizeAppearance(DEFAULT_APPEARANCE)
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return normalizeAppearance(DEFAULT_APPEARANCE)
    const parsed = JSON.parse(raw)
    return normalizeAppearance(parsed)
  } catch (err) {
    console.warn('appearance restore failed', err)
    return normalizeAppearance(DEFAULT_APPEARANCE)
  }
}

const persistAppearance = (appearance) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
  } catch (err) {
    console.warn('appearance persist failed', err)
  }
}

const buildNoiseTexture = (() => {
  let cache = null
  return () => {
    if (typeof document === 'undefined') return null
    if (cache) return cache
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 160
      const ctx = canvas.getContext('2d', { willReadFrequently: false })
      if (!ctx) return null
      const imageData = ctx.createImageData(canvas.width, canvas.height)
      for (let i = 0; i < imageData.data.length; i += 4) {
        const shade = Math.random() * 255
        imageData.data[i] = shade
        imageData.data[i + 1] = shade
        imageData.data[i + 2] = shade
        imageData.data[i + 3] = 255
      }
      ctx.putImageData(imageData, 0, 0)
      cache = canvas.toDataURL('image/png')
      return cache
    } catch (err) {
      console.warn('noise texture build failed', err)
      return null
    }
  }
})()

const RECONNECT_DELAYS = [5000, 10000, 20000]

let reconnectTimeoutId = null
let reconnectCountdownIntervalId = null


export const buildDirectChannelId = (a, b) => {
  if (!a || !b) return null
  const [first, second] = [a, b].sort()
  return `dm:${first}:${second}`
}

const parseDirectChannelId = (channelId) => {
  if (!channelId || typeof channelId !== 'string') return null
  if (!channelId.startsWith('dm:')) return null
  const parts = channelId.split(':')
  if (parts.length !== 3) return null
  const [, rawA, rawB] = parts
  if (!rawA || !rawB) return null
  const [first, second] = [rawA, rawB].sort()
  return { first, second }
}

const peerFromDirectChannel = (channelId, selfId) => {
  if (!selfId) return null
  const parsed = parseDirectChannelId(channelId)
  if (!parsed) return null
  if (parsed.first === selfId) return parsed.second
  if (parsed.second === selfId) return parsed.first
  return null
}

const normalizeNameStyle = (raw) => {
  if (!raw) return DEFAULT_NAME_STYLE
  if (typeof raw === 'string') {
    try {
      return normalizeNameStyle(JSON.parse(raw))
    } catch (err) {
      return DEFAULT_NAME_STYLE
    }
  }
  return {
    font: typeof raw.font === 'string' ? raw.font : DEFAULT_NAME_STYLE.font,
    effect: typeof raw.effect === 'string' ? raw.effect : DEFAULT_NAME_STYLE.effect,
    color: typeof raw.color === 'string' ? raw.color : DEFAULT_NAME_STYLE.color,
  }
}

const normalizeUser = (raw) => {
  if (!raw) return null
  return {
    id: raw.id,
    username: raw.username,
    role: raw.role,
    avatarSeed: raw.avatarSeed ?? raw.avatar_seed ?? '',
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? '',
    avatarUpdatedAt: raw.avatarUpdatedAt ?? raw.avatar_updated_at ?? 0,
    displayName: raw.displayName ?? raw.display_name ?? '',
    profileStatus: raw.profileStatus ?? raw.profile_status ?? '',
    profileBackground: raw.profileBackground ?? raw.profile_background ?? '',
    nameStyle: normalizeNameStyle(raw.nameStyle ?? raw.name_style),
  }
}

const loadStoredAuth = () => {
  if (typeof window === 'undefined') return { token: null, user: null }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return { token: null, user: null }
    const parsed = JSON.parse(raw)
    const token = typeof parsed.token === 'string' && parsed.token.length ? parsed.token : null
    if (!token) return { token: null, user: null }
    return { token, user: normalizeUser(parsed.user) }
  } catch (err) {
    console.warn('auth restore failed', err)
    return { token: null, user: null }
  }
}

const loadUserStatus = () => {
  if (typeof window === 'undefined') return 'online'
  try {
    const raw = window.localStorage.getItem(USER_STATUS_KEY)
    if (!raw) return 'online'
    const normalized = raw.trim().toLowerCase()
    if (['online', 'idle', 'dnd', 'invisible'].includes(normalized)) return normalized
  } catch (err) {
    console.warn('user status restore failed', err)
  }
  return 'online'
}

const persistUserStatus = (status) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(USER_STATUS_KEY, status)
  } catch (err) {
    console.warn('user status persist failed', err)
  }
}

const loadProfileStatus = () => {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(PROFILE_STATUS_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch (err) {
    console.warn('profile status restore failed', err)
    return ''
  }
}

const persistProfileStatus = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(PROFILE_STATUS_KEY, value)
    else window.localStorage.removeItem(PROFILE_STATUS_KEY)
  } catch (err) {
    console.warn('profile status persist failed', err)
  }
}

const loadNameStyle = () => {
  if (typeof window === 'undefined') return DEFAULT_NAME_STYLE
  try {
    const raw = window.localStorage.getItem(NAME_STYLE_KEY)
    if (!raw) return DEFAULT_NAME_STYLE
    const parsed = JSON.parse(raw)
    return {
      font: typeof parsed.font === 'string' ? parsed.font : DEFAULT_NAME_STYLE.font,
      effect: typeof parsed.effect === 'string' ? parsed.effect : DEFAULT_NAME_STYLE.effect,
      color: typeof parsed.color === 'string' ? parsed.color : DEFAULT_NAME_STYLE.color,
    }
  } catch (err) {
    console.warn('name style restore failed', err)
    return DEFAULT_NAME_STYLE
  }
}

const persistNameStyle = (style) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NAME_STYLE_KEY, JSON.stringify(style))
  } catch (err) {
    console.warn('name style persist failed', err)
  }
}

export const buildNameStyle = (style = DEFAULT_NAME_STYLE) => {
  const font = style?.font || DEFAULT_NAME_STYLE.font
  const effect = style?.effect || DEFAULT_NAME_STYLE.effect
  const color = style?.color || DEFAULT_NAME_STYLE.color
  const families = {
    rubik: '"Rubik", sans-serif',
    inter: '"Inter", sans-serif',
    mono: '"JetBrains Mono", monospace',
    serif: '"Times New Roman", serif',
    display: '"Trebuchet MS", sans-serif',
    georgia: 'Georgia, serif',
  }
  const result = {
    fontFamily: families[font] || families[DEFAULT_NAME_STYLE.font],
    color,
  }
  if (effect === 'gradient') {
    result.backgroundImage = `linear-gradient(90deg, ${color}, #ffffff)`
    result.WebkitBackgroundClip = 'text'
    result.backgroundClip = 'text'
    result.WebkitTextFillColor = 'transparent'
    result.color = 'transparent'
  } else if (effect === 'neon') {
    result.textShadow = `0 0 10px ${color}, 0 0 24px ${color}`
  } else if (effect === 'glow') {
    result.textShadow = `0 0 6px ${color}`
  } else if (effect === 'outline') {
    result.textShadow = `-1px 0 ${color}, 0 1px ${color}, 1px 0 ${color}, 0 -1px ${color}`
  }
  return result
}

const loadProfileBackground = () => {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(PROFILE_BACKGROUND_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch (err) {
    console.warn('profile background restore failed', err)
    return ''
  }
}

const persistProfileBackground = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(PROFILE_BACKGROUND_KEY, value)
    else window.localStorage.removeItem(PROFILE_BACKGROUND_KEY)
  } catch (err) {
    console.warn('profile background persist failed', err)
  }
}

const loadServerUrl = () => {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SERVER_URL_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch (err) {
    console.warn('server url restore failed', err)
    return ''
  }
}

const persistServerUrl = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(SERVER_URL_KEY, value)
    else window.localStorage.removeItem(SERVER_URL_KEY)
  } catch (err) {
    console.warn('server url persist failed', err)
  }
}
const persistAuth = (token, user) => {
  if (typeof window === 'undefined') return
  try {
    if (token && user) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }))
    } else {
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch (err) {
    console.warn('auth persist failed', err)
  }
}


const normalizeInvite = (raw) => {
  if (!raw) return null
  return {
    id: raw.id ?? '',
    code: raw.code ?? '',
    status: raw.status ?? 'active',
    createdAt: raw.createdAt ?? raw.created_at ?? 0,
    expiresAt: raw.expiresAt ?? raw.expires_at ?? 0,
    claimedAt: raw.claimedAt ?? raw.claimed_at ?? 0,
    usedAt: raw.usedAt ?? raw.used_at ?? 0,
    usedBy: raw.usedBy ?? raw.used_by ?? '',
    revokedAt: raw.revokedAt ?? raw.revoked_at ?? 0,
    createdBy: raw.createdBy ?? raw.created_by ?? '',
  }
}

const normalizeChannel = (raw) => {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name ?? raw.channelName ?? 'channel',
    createdAt: raw.createdAt ?? raw.created_at ?? Date.now(),
    isPrivate: Boolean(raw.isPrivate ?? raw.is_private ?? false),
    createdBy: raw.createdBy ?? raw.created_by ?? '',
    memberCount: raw.memberCount ?? raw.member_count ?? 0,
    membershipRole: raw.membershipRole ?? raw.membership_role ?? '',
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? '',
    avatarUpdatedAt: raw.avatarUpdatedAt ?? raw.avatar_updated_at ?? 0,
  }
}


const deriveKey = (cid) => {
  if (!cid) return null
  const source = encoder.encode(String(cid))
  if (!source.length) return null
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i += 1) {
    bytes[i] = source[i % source.length]
  }
  return u8.encodeBase64(bytes)
}

const enc = {
  setKeyForChannel: (cid, keyStr) => localStorage.setItem(storageKeyForChannel(cid), keyStr),
  getKeyForChannel: (cid) => localStorage.getItem(storageKeyForChannel(cid)) || deriveKey(cid),
  ensureKey: (cid) => {
    if (!cid) return null
    const keyName = storageKeyForChannel(cid)
    let keyStr = localStorage.getItem(keyName)
    if (!keyStr) {
      keyStr = deriveKey(cid)
      if (keyStr) localStorage.setItem(keyName, keyStr)
    }
    return keyStr
  },
  encrypt: (cid, text) => {
    const keyStr = enc.ensureKey(cid)
    if (!keyStr) return text
    const key = u8.decodeBase64(keyStr)
    const nonce = nacl.randomBytes(24)
    const box = nacl.secretbox(u8.decodeUTF8(text), nonce, key)
    return `enc:${u8.encodeBase64(nonce)}:${u8.encodeBase64(box)}`
  },
  decrypt: (cid, payload) => {
    if (typeof payload !== 'string' || !payload.startsWith('enc:')) return payload
    const keyStr = enc.ensureKey(cid)
    if (!keyStr) return '[Encrypted]'
    try {
      const [, nonceB, boxB] = payload.split(':')
      const nonce = u8.decodeBase64(nonceB)
      const box = u8.decodeBase64(boxB)
      const key = u8.decodeBase64(keyStr)
      const opened = nacl.secretbox.open(box, nonce, key)
      return opened ? u8.encodeUTF8(opened) : '[Decryption failed]'
    } catch (err) {
      console.error('decrypt error', err)
      return '[Decryption failed]'
    }
  },
}

const buildReplyPreview = (content, fallback = 'Без текста') => {
  if (typeof content !== 'string') return fallback
  const text = content.replace(/\s+/g, ' ').trim()
  if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text
  return fallback
}

const formatMessage = (fallbackChannelId) => (raw) => {
  if (!raw) return null
  const channelId = raw.channelId ?? raw.channel_id ?? fallbackChannelId
  const senderId = raw.senderId ?? raw.sender_id ?? raw.user_id ?? null
  const createdAt = raw.createdAt ?? raw.created_at ?? Date.now()
  const replyRaw = raw.replyTo ?? raw.reply_to ?? null
  let replyTo = null
  if (replyRaw?.id) {
    const replyChannelId = replyRaw.channelId ?? replyRaw.channel_id ?? channelId
    const encryptedReplyContent = replyRaw.content ?? replyRaw.reply_content ?? null
    const decryptedReplyContent =
      typeof encryptedReplyContent === 'string' ? enc.decrypt(replyChannelId, encryptedReplyContent) : ''
    const replyFallback = encryptedReplyContent == null ? 'Сообщение недоступно' : 'Без текста'
    const preview = buildReplyPreview(decryptedReplyContent, replyFallback)
    replyTo = {
      id: replyRaw.id,
      authorId: replyRaw.senderId ?? replyRaw.sender_id ?? replyRaw.authorId ?? null,
      author: replyRaw.senderUsername ?? replyRaw.sender_username ?? replyRaw.author ?? null,
      preview,
      missing: encryptedReplyContent == null,
    }
  }
  return {
    id: raw.id,
    channelId,
    senderId,
    createdAt,
    updatedAt: raw.updatedAt ?? raw.updated_at ?? 0,
    content: enc.decrypt(channelId, raw.content),
    replyTo,
  }
}

const buildAuthHeaders = (token) => ({ Authorization: `Bearer ${token}` })

const initialAuth = loadStoredAuth()

const useStore = create((set, get) => ({
  serverUrl: loadServerUrl() || import.meta.env.VITE_LGM_SERVER || 'http://localhost:4000',
  token: initialAuth.token,
  user: initialAuth.user,
  userStatus: loadUserStatus(),
  profileBackground: loadProfileBackground(),
  profileStatus: loadProfileStatus(),
  nameStyle: loadNameStyle(),
  users: [],
  view: 'chat',
  socket: null,
  connectionStatus: 'idle',
  reconnectAttempt: 0,
  retryAt: null,
  retryDelay: null,
  retrySecondsRemaining: null,
  connectionError: null,
  workspaces: [],
  channels: [],
  activeChannelId: null,
  messages: {},
  unread: {},
  onlineUserIds: [],
  friends: [],
  friendRequests: { incoming: [], outgoing: [] },
  historyLoading: {},
  historyComplete: {},
  directPeers: {},
  channelMembers: {},
  typing: {},
  invites: [],
  appearance: loadAppearance(),
  appearanceNoise: null,

  setAuth: (token, user, options = {}) => {
    const normalized = normalizeUser(user)
    const shouldPersist = options.persist ?? true
    if (token && normalized && shouldPersist) persistAuth(token, normalized)
    else if (!token || !shouldPersist) persistAuth(null, null)
    if (normalized?.nameStyle) persistNameStyle(normalized.nameStyle)
    if (typeof normalized?.profileStatus === 'string') persistProfileStatus(normalized.profileStatus)
    if (typeof normalized?.profileBackground === 'string') persistProfileBackground(normalized.profileBackground)
    set((state) => {
      let list = state.users
      if (normalized) {
        const exists = list.some((u) => u.id === normalized.id)
        list = exists ? list.map((u) => (u.id === normalized.id ? normalized : u)) : [...list, normalized]
      }
      return {
        token,
        user: normalized,
        nameStyle: normalized?.nameStyle || state.nameStyle,
        profileStatus: normalized?.profileStatus ?? state.profileStatus,
        profileBackground: normalized?.profileBackground ?? state.profileBackground,
        users: list,
        view: 'chat',
      }
    })
  },
  setView: (view) => set({ view }),
  setUserStatus: (status) => {
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : ''
    if (!['online', 'idle', 'dnd', 'invisible'].includes(normalized)) return
    persistUserStatus(normalized)
    set({ userStatus: normalized })
  },
  setProfileStatus: (value) => {
    const normalized = typeof value === 'string' ? value.trim() : ''
    persistProfileStatus(normalized)
    set((state) => ({
      profileStatus: normalized,
      user: state.user ? { ...state.user, profileStatus: normalized } : state.user,
      users: state.user?.id
        ? state.users.map((u) => (u.id === state.user.id ? { ...u, profileStatus: normalized } : u))
        : state.users,
    }))
  },
  setNameStyle: (patch) => {
    const next = {
      font: DEFAULT_NAME_STYLE.font,
      effect: DEFAULT_NAME_STYLE.effect,
      color: DEFAULT_NAME_STYLE.color,
      ...(typeof patch === 'object' && patch ? patch : {}),
    }
    persistNameStyle(next)
    set((state) => ({
      nameStyle: next,
      user: state.user ? { ...state.user, nameStyle: next } : state.user,
      users: state.user?.id
        ? state.users.map((u) => (u.id === state.user.id ? { ...u, nameStyle: next } : u))
        : state.users,
    }))
  },
  updateNameStyle: async (style) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const payload = {
      font: typeof style?.font === 'string' ? style.font : DEFAULT_NAME_STYLE.font,
      effect: typeof style?.effect === 'string' ? style.effect : DEFAULT_NAME_STYLE.effect,
      color: typeof style?.color === 'string' ? style.color : DEFAULT_NAME_STYLE.color,
    }
    const { data } = await axios.post(
      `${get().serverUrl}/api/profile/name-style`,
      payload,
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    persistNameStyle(updated.nameStyle)
    set((state) => ({
      nameStyle: updated.nameStyle,
      user: state.user?.id === updated.id ? updated : state.user,
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? updated : u))
        : [...state.users, updated],
    }))
    return updated
  },
  setProfileBackground: (value) => {
    const normalized = typeof value === 'string' ? value : ''
    persistProfileBackground(normalized)
    set((state) => ({
      profileBackground: normalized,
      user: state.user ? { ...state.user, profileBackground: normalized } : state.user,
      users: state.user?.id
        ? state.users.map((u) => (u.id === state.user.id ? { ...u, profileBackground: normalized } : u))
        : state.users,
    }))
  },
  setServerUrl: (nextUrl, options = {}) => {
    const raw = typeof nextUrl === 'string' ? nextUrl.trim() : ''
    if (!raw) return false
    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`
    persistServerUrl(normalized)
    set({ serverUrl: normalized })
    if (options.reconnect && get().token) {
      get().connect()
    }
    return true
  },
  openProfile: () => set({ view: 'profile' }),
  openSettings: () => set({ view: 'settings' }),
  openChat: () => set({ view: 'chat' }),
  openAdmin: () => {
    if (get().user?.role !== 'admin') return
    set({ view: 'admin' })
  },
  logout: () => {
    persistAuth(null, null)
    const socket = get().socket
    if (socket) {
      if (typeof socket.removeAllListeners === 'function') socket.removeAllListeners()
      if (socket.io?.off) socket.io.off('close')
      socket.disconnect()
    }
    try {
      get().cancelReconnectCountdown()
    } catch (err) {
      console.warn('cancel reconnect on logout failed', err)
    }
    set({
      token: null,
      user: null,
      view: 'chat',
      socket: null,
      connectionStatus: 'idle',
      reconnectAttempt: 0,
      retryAt: null,
      retryDelay: null,
      retrySecondsRemaining: null,
      connectionError: null,
      workspaces: [],
      channels: [],
      activeChannelId: null,
      messages: {},
      unread: {},
      onlineUserIds: [],
      friends: [],
      friendRequests: { incoming: [], outgoing: [] },
      historyLoading: {},
      historyComplete: {},
      directPeers: {},
      channelMembers: {},
      typing: {},
      invites: [],
    })
  },
  setAppearance: (patch) => {
    set((state) => {
      const previous = state.appearance ? cloneAppearance(state.appearance) : normalizeAppearance(DEFAULT_APPEARANCE)
      const candidate = typeof patch === 'function' ? patch(previous) ?? previous : { ...previous, ...patch }
      const normalized = normalizeAppearance(candidate)
      persistAppearance(normalized)
      return { appearance: normalized }
    })
  },
  resetAppearance: () => {
    const normalized = normalizeAppearance(DEFAULT_APPEARANCE)
    persistAppearance(normalized)
    set({ appearance: normalized })
  },
  ensureAppearanceNoise: () => {
    const noise = buildNoiseTexture()
    if (noise) set({ appearanceNoise: noise })
    return noise
  },
  setChannelKey: (cid, keyStr) => enc.setKeyForChannel(cid, keyStr),
  getChannelKey: (cid) => enc.getKeyForChannel(cid),
  buildAvatarUrl: (user) => {
    if (!user?.avatarUrl) return null
    try {
      const server = get().serverUrl
      const base = server.endsWith('/') ? server : server + '/'
      const url = new URL(user.avatarUrl, base)
      if (user.avatarUpdatedAt) url.searchParams.set('v', user.avatarUpdatedAt)
      return url.toString()
    } catch (err) {
      console.error('avatar url build failed', err)
      return null
    }
  },
  buildChannelAvatarUrl: (channel) => {
    if (!channel?.avatarUrl) return null
    try {
      const server = get().serverUrl
      const base = server.endsWith('/') ? server : `${server}/`
      const url = new URL(channel.avatarUrl, base)
      if (channel.avatarUpdatedAt) url.searchParams.set('v', channel.avatarUpdatedAt)
      return url.toString()
    } catch (err) {
      console.error('channel avatar url build failed', err)
      return null
    }
  },

  cancelReconnectCountdown: () => {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId)
      reconnectTimeoutId = null
    }
    if (reconnectCountdownIntervalId) {
      clearInterval(reconnectCountdownIntervalId)
      reconnectCountdownIntervalId = null
    }
    set((state) => {
      if (state.retryDelay === null && state.retryAt === null && state.retrySecondsRemaining === null) return state
      return { retryDelay: null, retryAt: null, retrySecondsRemaining: null }
    })
  },
  beginReconnectCountdown: (delay, message) => {
    if (!delay) return
    get().cancelReconnectCountdown()
    const targetAt = Date.now() + delay
    set({
      connectionStatus: 'retrying',
      retryDelay: delay,
      retryAt: targetAt,
      retrySecondsRemaining: Math.ceil(delay / 1000),
      connectionError: message || null,
    })
    reconnectCountdownIntervalId = setInterval(() => {
      const remainingMs = targetAt - Date.now()
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
      set((state) => {
        if (state.connectionStatus !== 'retrying') return state
        if (state.retrySecondsRemaining === seconds) return state
        return { retrySecondsRemaining: seconds }
      })
      if (seconds <= 0) {
        clearInterval(reconnectCountdownIntervalId)
        reconnectCountdownIntervalId = null
      }
    }, 250)
    reconnectTimeoutId = setTimeout(() => {
      reconnectTimeoutId = null
      if (reconnectCountdownIntervalId) {
        clearInterval(reconnectCountdownIntervalId)
        reconnectCountdownIntervalId = null
      }
      if (!get().token) {
        set({ connectionStatus: 'idle' })
        return
      }
      set((state) => ({
        retryDelay: null,
        retryAt: null,
        retrySecondsRemaining: null,
        connectionStatus: 'connecting',
        connectionError: state.connectionError,
      }))
      get().connect()
    }, delay)
  },
  triggerReconnectNow: () => {
    if (!get().token) return
    const existing = get().socket
    if (existing) {
      if (typeof existing.removeAllListeners === 'function') existing.removeAllListeners()
      if (existing.io?.off) existing.io.off('close')
      existing.disconnect()
    }
    get().cancelReconnectCountdown()
    set({ reconnectAttempt: 0, connectionStatus: 'connecting', connectionError: null })
    get().connect()
  },
  connect: async () => {
    const token = get().token
    if (!token) return
    const server = get().serverUrl
    get().cancelReconnectCountdown()
    const existingSocket = get().socket
    if (existingSocket) {
      if (typeof existingSocket.removeAllListeners === 'function') existingSocket.removeAllListeners()
      if (existingSocket.io?.off) existingSocket.io.off('close')
      existingSocket.disconnect()
    }
    set({ connectionStatus: 'connecting', connectionError: null })
    const socket = io(server, { auth: { token }, reconnection: false })
    set({ socket })
    const manager = socket.io
    let handleCloseRef = null

    const scheduleReconnect = (error) => {
      if (!get().token) return
      const message = typeof error === 'string' ? error : error?.message || null
      if (manager?.off && handleCloseRef) manager.off('close', handleCloseRef)
      if (reconnectTimeoutId) {
        if (message) {
          set((state) => {
            if (state.connectionError === message) return state
            return { connectionError: message }
          })
        }
        return
      }
      const nextAttempt = get().reconnectAttempt + 1
      const delay = RECONNECT_DELAYS[nextAttempt - 1]
      set((state) => {
        const patch = { reconnectAttempt: nextAttempt, connectionError: message || null }
        if (state.socket === socket) patch.socket = null
        return patch
      })
      if (delay) {
        get().beginReconnectCountdown(delay, message)
      } else {
        set((state) => {
          const patch = {
            connectionStatus: 'awaiting_manual',
            retryDelay: null,
            retryAt: null,
            retrySecondsRemaining: null,
          }
          if (message) patch.connectionError = message
          if (state.socket === socket) patch.socket = null
          return patch
        })
      }
    }

    const handleClose = (reason) => {
      scheduleReconnect(reason)
    }
    handleCloseRef = handleClose

    if (manager?.on) manager.on('close', handleClose)

      socket.on('connect', async () => {
        get().cancelReconnectCountdown()
        set({ connectionStatus: 'connected', reconnectAttempt: 0, connectionError: null })
        socket.emit('init:request', {})
        try {
          const { data } = await axios.get(`${server}/api/users`, { headers: buildAuthHeaders(get().token) })
        const normalized = (data.users || []).map(normalizeUser).filter(Boolean)
        set((state) => {
          const current = state.user ? normalized.find((u) => u.id === state.user.id) || state.user : state.user
          return { users: normalized, user: current }
        })
        } catch (err) {
          console.error('users fetch failed', err)
        }
      })

      socket.on('connect_error', (err) => {
        scheduleReconnect(err)
      })

      socket.on('friends:requests:update', () => {
        get().fetchFriendRequests().catch((error) => {
          console.warn('fetch friend requests failed', error)
        })
        get().fetchFriends().catch((error) => {
          console.warn('fetch friends failed', error)
        })
      })

    socket.on('init:response', ({ workspaces, channels, activeChannelId, messages }) => {
      const normalizeMessage = formatMessage(activeChannelId)
      const normalizedChannels = Array.isArray(channels) ? channels.map(normalizeChannel).filter(Boolean) : []
      set({
        workspaces: Array.isArray(workspaces) ? workspaces : [],
        channels: normalizedChannels,
        activeChannelId,
        messages: activeChannelId ? { [activeChannelId]: messages.map(normalizeMessage).filter(Boolean) } : {},
        unread: {},
        historyComplete: activeChannelId ? { [activeChannelId]: messages.length < 50 } : {},
        historyLoading: {},
        typing: {},
      })
    })

    socket.on('channel:opened', ({ channelId, messages }) => {
      const normalize = formatMessage(channelId)
      set((state) => {
        const payload = {
          activeChannelId: channelId,
          messages: { ...state.messages, [channelId]: messages.map(normalize).filter(Boolean) },
          unread: { ...state.unread, [channelId]: 0 },
          historyLoading: { ...state.historyLoading, [channelId]: false },
          historyComplete: { ...state.historyComplete, [channelId]: messages.length < 50 },
          typing: { ...state.typing },
        }
        if (payload.typing[channelId]) {
          payload.typing[channelId] = payload.typing[channelId].filter((entry) => entry.userId !== state.user?.id)
          if (!payload.typing[channelId].length) delete payload.typing[channelId]
        }
        if (channelId?.startsWith('dm:')) {
          const peerId = peerFromDirectChannel(channelId, state.user?.id)
          if (peerId) payload.directPeers = { ...state.directPeers, [channelId]: peerId }
        }
        return payload
      })
    })

    socket.on('messages:page', ({ channelId, messages, limit = 50 }) => {
      const page = messages.map(formatMessage(channelId)).filter(Boolean)
      set((state) => {
        const existing = state.messages[channelId] || []
        const known = new Set(existing.map((m) => m.id))
        const merged = [...page.filter((m) => !known.has(m.id)), ...existing]
        const payload = {
          messages: { ...state.messages, [channelId]: merged },
          historyLoading: { ...state.historyLoading, [channelId]: false },
          historyComplete: { ...state.historyComplete, [channelId]: page.length < limit },
        }
        if (channelId?.startsWith('dm:')) {
          const peerId = peerFromDirectChannel(channelId, state.user?.id)
          if (peerId) payload.directPeers = { ...state.directPeers, [channelId]: peerId }
        }
        return payload
      })
    })

    socket.on('message:new', (payload) => {
      const normalized = formatMessage(payload.channelId)(payload)
      if (!normalized) return
      set((state) => {
        const isDirectChannel = payload.channelId?.startsWith('dm:')
        const peerId = isDirectChannel ? peerFromDirectChannel(payload.channelId, state.user?.id) : null
        const peerUser = peerId ? state.users.find((u) => u.id === peerId) : null
        const channelEntry = !isDirectChannel ? state.channels.find((entry) => entry.id === payload.channelId) : null
        if (normalized.senderId !== state.user?.id) {
          const authorUser = state.users.find((u) => u.id === normalized.senderId)
          const author = authorUser?.displayName || authorUser?.username || 'Неизвестный'
          const hasContent = typeof normalized.content === 'string' && normalized.content.trim()
          const peerLabel = peerUser?.displayName || peerUser?.username || ''
          const channelLabel = channelEntry?.name || (peerLabel ? peerLabel : isDirectChannel ? 'Личные сообщения' : null)
          showNewMessageNotification({
            author,
            content: hasContent ? normalized.content : 'Нет содержимого',
            messageId: normalized.id,
            channelId: payload.channelId,
            channelName: channelLabel,
            direct: Boolean(isDirectChannel),
          })
        }

        const arr = state.messages[payload.channelId] || []
        const isActive = state.activeChannelId === payload.channelId
        const nextUnread = isActive ? 0 : (state.unread[payload.channelId] || 0) + 1
        const typing = { ...state.typing }
        if (normalized.senderId && typing[payload.channelId]) {
          const filteredTyping = typing[payload.channelId].filter((entry) => entry.userId !== normalized.senderId)
          if (filteredTyping.length) typing[payload.channelId] = filteredTyping
          else delete typing[payload.channelId]
        }
        const result = {
          messages: { ...state.messages, [payload.channelId]: [...arr, normalized] },
          unread: { ...state.unread, [payload.channelId]: nextUnread },
          typing,
        }
        if (isDirectChannel && peerId) {
          result.directPeers = { ...state.directPeers, [payload.channelId]: peerId }
        }
        return result
      })
    })

    socket.on('message:updated', (payload) => {
      const normalized = formatMessage(payload.channelId)(payload)
      if (!normalized) return
      set((state) => {
        const existing = state.messages[payload.channelId] || []
        const index = existing.findIndex((m) => m.id === normalized.id)
        if (index === -1) return state
        const nextMessages = [...existing]
        nextMessages[index] = { ...existing[index], ...normalized }
        return { messages: { ...state.messages, [payload.channelId]: nextMessages } }
      })
    })

    socket.on('message:deleted', ({ id, channelId }) => {
      if (!id || !channelId) return
      set((state) => {
        const existing = state.messages[channelId] || []
        const filtered = existing.filter((m) => m.id !== id)
        if (filtered.length === existing.length) return state
        const unread = { ...state.unread }
        if (state.activeChannelId !== channelId) {
          unread[channelId] = Math.max(0, (unread[channelId] || 0) - 1)
        }
        return {
          messages: { ...state.messages, [channelId]: filtered },
          unread,
        }
      })
    })

    socket.on('channel:list', ({ channels }) => {
      const normalized = Array.isArray(channels) ? channels.map(normalizeChannel).filter(Boolean) : []
      set((state) => {
        const activeIsDm = state.activeChannelId?.startsWith('dm:')
        let nextActive = state.activeChannelId
        if (!activeIsDm && nextActive && !normalized.some((channel) => channel.id === nextActive)) {
          nextActive = normalized[0]?.id || null
        }
        const messages = { ...state.messages }
        const unread = { ...state.unread }
        const historyLoading = { ...state.historyLoading }
        const historyComplete = { ...state.historyComplete }
        const typing = { ...state.typing }
        const channelIds = new Set(normalized.map((channel) => channel.id))
        Object.keys(messages).forEach((channelId) => {
          if (!channelId.startsWith('dm:') && !channelIds.has(channelId)) {
            delete messages[channelId]
            delete unread[channelId]
            delete historyLoading[channelId]
            delete historyComplete[channelId]
            delete typing[channelId]
          }
        })
        const nextState = {
          channels: normalized,
          messages,
          unread,
          historyLoading,
          historyComplete,
          typing,
        }
        if (nextActive !== state.activeChannelId) {
          nextState.activeChannelId = nextActive
        }
        return nextState
      })
    })

    socket.on('channel:revoked', ({ channelId }) => {
      if (!channelId) return
      set((state) => {
        if (!state.channels.some((channel) => channel.id === channelId)) return state
        const nextChannels = state.channels.filter((channel) => channel.id !== channelId)
        const nextMessages = { ...state.messages }
        delete nextMessages[channelId]
        const nextUnread = { ...state.unread }
        delete nextUnread[channelId]
        const nextHistoryLoading = { ...state.historyLoading }
        delete nextHistoryLoading[channelId]
        const nextHistoryComplete = { ...state.historyComplete }
        delete nextHistoryComplete[channelId]
        const nextTyping = { ...state.typing }
        delete nextTyping[channelId]
        const result = {
          channels: nextChannels,
          messages: nextMessages,
          unread: nextUnread,
          historyLoading: nextHistoryLoading,
          historyComplete: nextHistoryComplete,
          typing: nextTyping,
        }
        if (state.activeChannelId === channelId) {
          result.activeChannelId = nextChannels[0]?.id || null
        }
        return result
      })
    })

    socket.on('typing:update', ({ channelId, userId: typingUserId, username, displayName, typing, nameStyle }) => {
      if (!channelId || !typingUserId) return
      set((state) => {
        if (typingUserId === state.user?.id) return state
        const existing = state.typing[channelId] || []
        const filtered = existing.filter((entry) => entry.userId !== typingUserId)
        if (typing) {
          const nextList = [
            ...filtered,
            {
              userId: typingUserId,
              username: username || typingUserId,
              displayName: typeof displayName === 'string' ? displayName : '',
              nameStyle: normalizeNameStyle(nameStyle),
            },
          ]
          return { typing: { ...state.typing, [channelId]: nextList } }
        }
        if (filtered.length === existing.length) return state
        const next = { ...state.typing }
        if (filtered.length) next[channelId] = filtered
        else delete next[channelId]
        return { typing: next }
      })
    })

    socket.on('user:update', (payload) => {
      const normalized = normalizeUser(payload)
      if (!normalized) return
      set((state) => {
        const users = state.users.some((u) => u.id === normalized.id)
          ? state.users.map((u) => (u.id === normalized.id ? { ...u, ...normalized } : u))
          : [...state.users, normalized]
        const user = state.user?.id === normalized.id ? { ...state.user, ...normalized } : state.user
        const isSelf = state.user?.id === normalized.id
        const nameStyle = isSelf ? normalized.nameStyle : state.nameStyle
        const patch = { users, user, nameStyle }
        if (isSelf && normalized?.nameStyle) {
          persistNameStyle(normalized.nameStyle)
        }
        if (state.user?.id === normalized.id) {
          if (typeof normalized.profileStatus === 'string') {
            persistProfileStatus(normalized.profileStatus)
            patch.profileStatus = normalized.profileStatus
          }
          if (typeof normalized.profileBackground === 'string') {
            persistProfileBackground(normalized.profileBackground)
            patch.profileBackground = normalized.profileBackground
          }
        }
        return patch
      })
    })

    socket.on('presence:update', ({ onlineUserIds }) => set({ onlineUserIds }))
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return
      scheduleReconnect(reason)
    })
  },

  switchChannel: (channelId) => {
    const socket = get().socket
    if (!socket || !channelId) return
    set((state) => ({
      activeChannelId: channelId,
      unread: { ...state.unread, [channelId]: 0 },
      view: 'chat',
    }))
    socket.emit('channel:switch', { channelId })
  },

  openDirectChat: (userId) => {
    const socket = get().socket
    const me = get().user
    if (!socket || !me?.id || !userId || userId === me.id) return
    const isFriend = get().friends.some((friend) => friend.id === userId)
    if (!isFriend) return
    const channelId = buildDirectChannelId(me.id, userId)
    set((state) => ({
      activeChannelId: channelId,
      unread: { ...state.unread, [channelId]: 0 },
      directPeers: { ...state.directPeers, [channelId]: userId },
      view: 'chat',
    }))
    socket.emit('channel:switch', { channelId })
  },

  sendMessage: (content, replyTo = null) => {
    const socket = get().socket
    const channelId = get().activeChannelId
    if (!socket || !channelId || !content.trim()) return
    const encrypted = enc.encrypt(channelId, content.trim())
    socket.emit('message:send', { channelId, content: encrypted, replyTo: replyTo || null })
  },

  editMessage: async (messageId, channelId, content, replyTo = undefined) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) throw new Error('invalid_content')
    const encrypted = enc.encrypt(channelId, trimmed)
    const payload = { content: encrypted }
    if (typeof replyTo !== 'undefined') payload.replyTo = replyTo
    await axios.patch(`${get().serverUrl}/api/messages/${messageId}`, payload, {
      headers: buildAuthHeaders(token),
    })
  },

  deleteMessage: async (messageId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    await axios.delete(`${get().serverUrl}/api/messages/${messageId}`, { headers: buildAuthHeaders(token) })
  },

  loadMore: () => {
    const socket = get().socket
    const channelId = get().activeChannelId
    if (!socket || !channelId) return
    const { historyLoading, historyComplete, messages } = get()
    if (historyLoading[channelId] || historyComplete[channelId]) return
    const offset = (messages[channelId] || []).length
    set((state) => ({ historyLoading: { ...state.historyLoading, [channelId]: true } }))
    socket.emit('messages:load', { channelId, limit: 50, offset })
  },

  createPrivateChannel: async (name, memberIds = []) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('invalid_name')
    const { data } = await axios.post(
      `${get().serverUrl}/api/channels`,
      { name: trimmed, memberIds: Array.isArray(memberIds) ? memberIds : [], isPrivate: true },
      { headers: buildAuthHeaders(token) },
    )
    const channel = normalizeChannel(data.channel)
    if (channel) {
      set((state) => {
        const exists = state.channels.some((ch) => ch.id === channel.id)
        const channels = exists
          ? state.channels.map((ch) => (ch.id === channel.id ? { ...ch, ...channel } : ch))
          : [...state.channels, channel]
        return { channels, activeChannelId: channel.id }
      })
    }
    const members = Array.isArray(data?.members)
      ? data.members
          .map((entry) => {
            const user = normalizeUser(entry.user)
            if (!user) return null
            return { user, role: entry.role || 'member' }
          })
          .filter(Boolean)
      : []
    if (channel && members.length) {
      set((state) => ({ channelMembers: { ...state.channelMembers, [channel.id]: members } }))
    }
    return channel
  },

  fetchFriends: async () => {
    const token = get().token
    if (!token) return []
    const { data } = await axios.get(`${get().serverUrl}/api/friends`, { headers: buildAuthHeaders(token) })
    const friends = Array.isArray(data?.friends) ? data.friends.map(normalizeUser).filter(Boolean) : []
    set((state) => {
      const known = new Map(state.users.map((u) => [u.id, u]))
      friends.forEach((friend) => {
        if (friend?.id && !known.has(friend.id)) known.set(friend.id, friend)
      })
      return { friends, users: Array.from(known.values()) }
    })
    return friends
  },

  fetchFriendRequests: async () => {
    const token = get().token
    if (!token) return { incoming: [], outgoing: [] }
    const { data } = await axios.get(`${get().serverUrl}/api/friends/requests`, { headers: buildAuthHeaders(token) })
    const incoming = Array.isArray(data?.incoming)
      ? data.incoming
          .map((entry) => ({
            id: entry.id,
            fromUser: normalizeUser(entry.fromUser),
            createdAt: entry.createdAt || 0,
          }))
          .filter((entry) => entry.fromUser)
      : []
    const outgoing = Array.isArray(data?.outgoing)
      ? data.outgoing
          .map((entry) => ({
            id: entry.id,
            toUser: normalizeUser(entry.toUser),
            createdAt: entry.createdAt || 0,
          }))
          .filter((entry) => entry.toUser)
      : []
    set({ friendRequests: { incoming, outgoing } })
    return { incoming, outgoing }
  },

  sendFriendRequest: async (username) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof username === 'string' ? username.trim() : ''
    if (!trimmed) throw new Error('invalid_username')
    const { data } = await axios.post(
      `${get().serverUrl}/api/friends/request`,
      { username: trimmed },
      { headers: buildAuthHeaders(token) },
    )
    await get().fetchFriendRequests()
    await get().fetchFriends()
    return data
  },

  respondFriendRequest: async (requestId, accept) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!requestId) throw new Error('invalid_request')
    const { data } = await axios.post(
      `${get().serverUrl}/api/friends/respond`,
      { requestId, accept: Boolean(accept) },
      { headers: buildAuthHeaders(token) },
    )
    await get().fetchFriendRequests()
    await get().fetchFriends()
    return data
  },

  removeFriend: async (userId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!userId) throw new Error('invalid_user')
    await axios.delete(`${get().serverUrl}/api/friends/${userId}`, { headers: buildAuthHeaders(token) })
    set((state) => ({
      friends: state.friends.filter((friend) => friend.id !== userId),
    }))
  },
  uploadChannelAvatar: async (channelId, file) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!channelId || !file) throw new Error('invalid_payload')
    const form = new FormData()
    form.append('avatar', file)
    const { data } = await axios.post(`${get().serverUrl}/api/channels/${channelId}/avatar`, form, {
      headers: buildAuthHeaders(token),
    })
    const channel = normalizeChannel(data?.channel)
    if (channel) {
      set((state) => ({
        channels: state.channels.some((entry) => entry.id === channel.id)
          ? state.channels.map((entry) => (entry.id === channel.id ? { ...entry, ...channel } : entry))
          : [...state.channels, channel],
      }))
    }
    return channel
  },
  deleteChannelAvatar: async (channelId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!channelId) throw new Error('invalid_channel')
    const { data } = await axios.delete(`${get().serverUrl}/api/channels/${channelId}/avatar`, {
      headers: buildAuthHeaders(token),
    })
    const channel = normalizeChannel(data?.channel)
    if (channel) {
      set((state) => ({
        channels: state.channels.some((entry) => entry.id === channel.id)
          ? state.channels.map((entry) => (entry.id === channel.id ? { ...entry, ...channel } : entry))
          : [...state.channels, channel],
      }))
    }
    return channel
  },

  deleteChannel: async (channelId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!channelId) throw new Error('invalid_channel')
    await axios.delete(`${get().serverUrl}/api/channels/${channelId}`, {
      headers: buildAuthHeaders(token),
    })
    set((state) => {
      const patch = {}
      let changed = false
      const nextChannels = state.channels.filter((channel) => channel.id !== channelId)
      const channelExists = nextChannels.length !== state.channels.length
      if (channelExists) {
        patch.channels = nextChannels
        changed = true
      }
      const removeEntry = (collection) => {
        if (!collection || typeof collection !== 'object') return null
        if (!Object.prototype.hasOwnProperty.call(collection, channelId)) return null
        const next = { ...collection }
        delete next[channelId]
        return next
      }
      const nextMessages = removeEntry(state.messages)
      if (nextMessages) {
        patch.messages = nextMessages
        changed = true
      }
      const nextUnread = removeEntry(state.unread)
      if (nextUnread) {
        patch.unread = nextUnread
        changed = true
      }
      const nextHistoryLoading = removeEntry(state.historyLoading)
      if (nextHistoryLoading) {
        patch.historyLoading = nextHistoryLoading
        changed = true
      }
      const nextHistoryComplete = removeEntry(state.historyComplete)
      if (nextHistoryComplete) {
        patch.historyComplete = nextHistoryComplete
        changed = true
      }
      const nextTyping = removeEntry(state.typing)
      if (nextTyping) {
        patch.typing = nextTyping
        changed = true
      }
      const nextChannelMembers = removeEntry(state.channelMembers)
      if (nextChannelMembers) {
        patch.channelMembers = nextChannelMembers
        changed = true
      }
      if (state.activeChannelId === channelId) {
        patch.activeChannelId = nextChannels[0]?.id || null
        changed = true
      }
      return changed ? patch : state
    })
    return true
  },

  fetchChannelMembers: async (channelId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.get(`${get().serverUrl}/api/channels/${channelId}/members`, {
      headers: buildAuthHeaders(token),
    })
    const members = Array.isArray(data?.members)
      ? data.members
          .map((entry) => {
            const user = normalizeUser(entry.user)
            if (!user) return null
            return { user, role: entry.role || 'member' }
          })
          .filter(Boolean)
      : []
    set((state) => ({ channelMembers: { ...state.channelMembers, [channelId]: members } }))
    return members
  },

  addChannelMember: async (channelId, userId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.post(
      `${get().serverUrl}/api/channels/${channelId}/members`,
      { userId },
      { headers: buildAuthHeaders(token) },
    )
    const members = Array.isArray(data?.members)
      ? data.members
          .map((entry) => {
            const user = normalizeUser(entry.user)
            if (!user) return null
            return { user, role: entry.role || 'member' }
          })
          .filter(Boolean)
      : []
    set((state) => ({ channelMembers: { ...state.channelMembers, [channelId]: members } }))
    return members
  },

  removeChannelMember: async (channelId, userId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.delete(`${get().serverUrl}/api/channels/${channelId}/members/${userId}`, {
      headers: buildAuthHeaders(token),
    })
    const members = Array.isArray(data?.members)
      ? data.members
          .map((entry) => {
            const user = normalizeUser(entry.user)
            if (!user) return null
            return { user, role: entry.role || 'member' }
          })
          .filter(Boolean)
      : []
    set((state) => ({ channelMembers: { ...state.channelMembers, [channelId]: members } }))
    return members
  },

  updateAvatar: async (file) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!file) throw new Error('invalid_avatar')
    const form = new FormData()
    form.append('avatar', file)
    const server = get().serverUrl
    const endpoint = server.endsWith('/') ? server + 'api/profile/avatar' : server + '/api/profile/avatar'
    const { data } = await axios.post(
      endpoint,
      form,
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    set((state) => ({
      user: state.user?.id === updated.id ? updated : state.user,
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? updated : u))
        : [...state.users, updated],
    }))
    return updated
  },

  changePassword: async (currentPassword, newPassword) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    await axios.post(
      `${get().serverUrl}/api/profile/password`,
      { currentPassword, newPassword },
      { headers: buildAuthHeaders(token) },
    )
  },

  updateDisplayName: async (displayName) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof displayName === 'string' ? displayName.trim() : ''
    const { data } = await axios.post(
      `${get().serverUrl}/api/profile/display-name`,
      { displayName: trimmed },
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    set((state) => ({
      user: state.user?.id === updated.id ? updated : state.user,
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? updated : u))
        : [...state.users, updated],
    }))
    return updated
  },

  updateProfileStatus: async (status) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof status === 'string' ? status.trim() : ''
    const { data } = await axios.post(
      `${get().serverUrl}/api/profile/status`,
      { status: trimmed },
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    persistProfileStatus(updated.profileStatus || '')
    set((state) => ({
      profileStatus: updated.profileStatus || '',
      user: state.user?.id === updated.id ? updated : state.user,
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? updated : u))
        : [...state.users, updated],
    }))
    return updated
  },

  updateProfileBackground: async (background) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const normalized = typeof background === 'string' ? background.trim() : ''
    const { data } = await axios.post(
      `${get().serverUrl}/api/profile/background`,
      { background: normalized },
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    persistProfileBackground(updated.profileBackground || '')
    set((state) => ({
      profileBackground: updated.profileBackground || '',
      user: state.user?.id === updated.id ? updated : state.user,
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? updated : u))
        : [...state.users, updated],
    }))
    return updated
  },

  fetchInvites: async () => {
    const token = get().token
    if (!token) return []
    const { data } = await axios.get(`${get().serverUrl}/api/invites`, { headers: buildAuthHeaders(token) })
    const invites = Array.isArray(data?.invites) ? data.invites.map(normalizeInvite).filter(Boolean) : []
    set({ invites })
    return invites
  },

  createInvite: async (ttlMs) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const payload = {}
    if (ttlMs) payload.ttlMs = ttlMs
    const { data } = await axios.post(`${get().serverUrl}/api/invites`, payload, { headers: buildAuthHeaders(token) })
    const invite = normalizeInvite(data?.invite)
    if (invite) {
      set((state) => ({ invites: [invite, ...state.invites.filter((item) => item.id !== invite.id)] }))
    }
    return invite
  },

  revokeInvite: async (inviteId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.post(
      `${get().serverUrl}/api/invites/${inviteId}/revoke`,
      {},
      { headers: buildAuthHeaders(token) },
    )
    const invite = normalizeInvite(data?.invite)
    if (invite) {
      set((state) => ({ invites: state.invites.map((item) => (item.id === invite.id ? invite : item)) }))
    }
    return invite
  },

  // Admin helpers
  adminUpdateUserRole: async (userId, role) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.patch(
      `${get().serverUrl}/api/admin/users/${userId}/role`,
      { role },
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    set((state) => ({
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
        : [...state.users, updated],
      user: state.user?.id === updated.id ? { ...state.user, ...updated } : state.user,
    }))
    return updated
  },
  adminResetUserPassword: async (userId, newPassword) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    await axios.post(
      `${get().serverUrl}/api/admin/users/${userId}/password`,
      { newPassword },
      { headers: buildAuthHeaders(token) },
    )
  },
  adminDeleteUserAvatar: async (userId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.delete(`${get().serverUrl}/api/admin/users/${userId}/avatar`, {
      headers: buildAuthHeaders(token),
    })
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    set((state) => ({
      users: state.users.some((u) => u.id === updated.id)
        ? state.users.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))
        : [...state.users, updated],
      user: state.user?.id === updated.id ? { ...state.user, ...updated } : state.user,
    }))
    return updated
  },
  adminDeleteUser: async (id) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const me = get().user
    if (me?.id === id) throw new Error('cannot_delete_self')
    await axios.delete(`${get().serverUrl}/api/admin/users/${id}`, { headers: buildAuthHeaders(token) })
    set((state) => {
      const directChannelId = state.user?.id ? buildDirectChannelId(state.user.id, id) : null
      const nextUsers = state.users.filter((u) => u.id !== id)
      const nextDirectPeers = { ...state.directPeers }
      const nextUnread = { ...state.unread }
      const nextHistoryLoading = { ...state.historyLoading }
      const nextHistoryComplete = { ...state.historyComplete }
      const nextMessages = { ...state.messages }
      const nextOnline = state.onlineUserIds.filter((userId) => userId !== id)
      if (directChannelId) {
        delete nextDirectPeers[directChannelId]
        delete nextUnread[directChannelId]
        delete nextHistoryLoading[directChannelId]
        delete nextHistoryComplete[directChannelId]
        delete nextMessages[directChannelId]
      }
      const patch = {
        users: nextUsers,
        directPeers: nextDirectPeers,
        unread: nextUnread,
        historyLoading: nextHistoryLoading,
        historyComplete: nextHistoryComplete,
        messages: nextMessages,
        onlineUserIds: nextOnline,
      }
      if (directChannelId && state.activeChannelId === directChannelId) {
        patch.activeChannelId = null
      }
      return patch
    })
  },

}))

export default useStore
