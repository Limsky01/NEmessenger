import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'
import { showNewMessageNotification } from '../utils/notifications'
import { removeWebPushSubscription, syncWebPushSubscription } from '../utils/webPush'

const storageKeyForChannel = (cid) => `chkey:${cid}`
const APPEARANCE_STORAGE_KEY = 'nemessenger:appearance'
const AUTH_STORAGE_KEY = 'nemessenger:auth'
const USER_STATUS_KEY = 'nemessenger:user-status'
const NAME_STYLE_KEY = 'nemessenger:name-style'
const PROFILE_STATUS_KEY = 'nemessenger:profile-status'
const PROFILE_BACKGROUND_KEY = 'nemessenger:profile-background'
const SERVER_URL_KEY = 'nemessenger:server-url'
const VOICE_SERVER_URL_KEY = 'nemessenger:voice-server-url'
const AUDIO_INPUT_DEVICE_KEY = 'nemessenger:audio-input-device'
const AUDIO_OUTPUT_DEVICE_KEY = 'nemessenger:audio-output-device'
const NOTIFICATION_SETTINGS_KEY = 'nemessenger:notification-settings'
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
const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  desktopEnabled: true,
  pushEnabled: true,
  soundEnabled: false,
  mentionsOnly: false,
  dndEnabled: false,
})
const ALLOWED_NAME_FONTS = new Set(['rubik', 'inter', 'mono', 'serif', 'display', 'georgia'])
const ALLOWED_NAME_EFFECTS = new Set(['minimal', 'gradient', 'neon', 'glow', 'outline'])

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
  const sanitizeColor = (value) => {
    if (typeof value !== 'string') return DEFAULT_NAME_STYLE.color
    const color = value.trim().slice(0, 32)
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
    const isRgb = /^rgba?\(\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(\s*,\s*(0|0?\.\d+|1(\.0+)?))?\s*\)$/.test(color)
    const isHsl = /^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(\s*,\s*(0|0?\.\d+|1(\.0+)?))?\s*\)$/.test(color)
    return isHex || isRgb || isHsl ? color : DEFAULT_NAME_STYLE.color
  }
  if (!raw) return DEFAULT_NAME_STYLE
  if (typeof raw === 'string') {
    try {
      return normalizeNameStyle(JSON.parse(raw))
    } catch (err) {
      return DEFAULT_NAME_STYLE
    }
  }
  const font = typeof raw.font === 'string' && ALLOWED_NAME_FONTS.has(raw.font) ? raw.font : DEFAULT_NAME_STYLE.font
  const effect = typeof raw.effect === 'string' && ALLOWED_NAME_EFFECTS.has(raw.effect) ? raw.effect : DEFAULT_NAME_STYLE.effect
  return {
    font,
    effect,
    color: sanitizeColor(raw.color),
  }
}

const normalizeUser = (raw) => {
  if (!raw) return null
  return {
    id: raw.id,
    username: raw.username,
    role: raw.role,
    publicKey: raw.publicKey ?? raw.public_key ?? '',
    avatarSeed: raw.avatarSeed ?? raw.avatar_seed ?? '',
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? '',
    avatarUpdatedAt: raw.avatarUpdatedAt ?? raw.avatar_updated_at ?? 0,
    displayName: raw.displayName ?? raw.display_name ?? '',
    profileStatus: raw.profileStatus ?? raw.profile_status ?? '',
    profileBackground: raw.profileBackground ?? raw.profile_background ?? '',
    userStatus: raw.userStatus ?? raw.user_status ?? 'online',
    nameStyle: normalizeNameStyle(raw.nameStyle ?? raw.name_style),
  }
}

const loadStoredAuth = () => {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null, user: null }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return { accessToken: null, refreshToken: null, user: null }
    const parsed = JSON.parse(raw)
    const accessToken = typeof parsed.accessToken === 'string' && parsed.accessToken.length ? parsed.accessToken : null
    const refreshToken = typeof parsed.refreshToken === 'string' && parsed.refreshToken.length ? parsed.refreshToken : null
    if (!accessToken || !refreshToken) return { accessToken: null, refreshToken: null, user: null }
    return { accessToken, refreshToken, user: normalizeUser(parsed.user) }
  } catch (err) {
    console.warn('auth restore failed', err)
    return { accessToken: null, refreshToken: null, user: null }
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
    return normalizeNameStyle(JSON.parse(raw))
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
  const normalized = normalizeNameStyle(style)
  const font = normalized.font
  const effect = normalized.effect
  const color = normalized.color
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

const loadVoiceServerUrl = () => {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(VOICE_SERVER_URL_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch (err) {
    console.warn('voice server url restore failed', err)
    return ''
  }
}

const persistVoiceServerUrl = (value) => {
  if (typeof window === 'undefined') return
  try {
    if (value) window.localStorage.setItem(VOICE_SERVER_URL_KEY, value)
    else window.localStorage.removeItem(VOICE_SERVER_URL_KEY)
  } catch (err) {
    console.warn('voice server url persist failed', err)
  }
}

const loadAudioInputDeviceId = () => {
  if (typeof window === 'undefined') return 'default'
  try {
    const raw = window.localStorage.getItem(AUDIO_INPUT_DEVICE_KEY)
    return typeof raw === 'string' && raw.trim() ? raw : 'default'
  } catch (err) {
    console.warn('audio input device restore failed', err)
    return 'default'
  }
}

const persistAudioInputDeviceId = (deviceId) => {
  if (typeof window === 'undefined') return
  try {
    const normalized = typeof deviceId === 'string' && deviceId.trim() ? deviceId : 'default'
    window.localStorage.setItem(AUDIO_INPUT_DEVICE_KEY, normalized)
  } catch (err) {
    console.warn('audio input device persist failed', err)
  }
}

const loadAudioOutputDeviceId = () => {
  if (typeof window === 'undefined') return 'default'
  try {
    const raw = window.localStorage.getItem(AUDIO_OUTPUT_DEVICE_KEY)
    return typeof raw === 'string' && raw.trim() ? raw : 'default'
  } catch (err) {
    console.warn('audio output device restore failed', err)
    return 'default'
  }
}

const persistAudioOutputDeviceId = (deviceId) => {
  if (typeof window === 'undefined') return
  try {
    const normalized = typeof deviceId === 'string' && deviceId.trim() ? deviceId : 'default'
    window.localStorage.setItem(AUDIO_OUTPUT_DEVICE_KEY, normalized)
  } catch (err) {
    console.warn('audio output device persist failed', err)
  }
}

const normalizeNotificationSettings = (raw = DEFAULT_NOTIFICATION_SETTINGS) => ({
  desktopEnabled: raw?.desktopEnabled !== false,
  pushEnabled: raw?.pushEnabled !== false,
  soundEnabled: Boolean(raw?.soundEnabled),
  mentionsOnly: Boolean(raw?.mentionsOnly),
  dndEnabled: Boolean(raw?.dndEnabled),
})

const loadNotificationSettings = () => {
  if (typeof window === 'undefined') return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_KEY)
    if (!raw) return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)
    const parsed = JSON.parse(raw)
    return normalizeNotificationSettings(parsed)
  } catch (err) {
    console.warn('notification settings restore failed', err)
    return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)
  }
}

const persistNotificationSettings = (settings) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('notification settings persist failed', err)
  }
}

const persistAuth = (accessToken, refreshToken, user) => {
  if (typeof window === 'undefined') return
  try {
    if (accessToken && refreshToken && user) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, user }))
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


const E2E_IDENTITY_PREFIX = 'nemessenger:e2e:identity:'
const keyStorageForUser = (userId) => `${E2E_IDENTITY_PREFIX}${userId}`

const randomSecretKeyB64 = () => u8.encodeBase64(nacl.randomBytes(32))

const loadIdentityForUser = (userId) => {
  if (typeof window === 'undefined' || !userId) return null
  try {
    const raw = window.localStorage.getItem(keyStorageForUser(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const publicKey = typeof parsed?.publicKey === 'string' ? parsed.publicKey : ''
    const secretKey = typeof parsed?.secretKey === 'string' ? parsed.secretKey : ''
    if (!publicKey || !secretKey) return null
    if (u8.decodeBase64(publicKey).length !== 32) return null
    if (u8.decodeBase64(secretKey).length !== 32) return null
    return { publicKey, secretKey }
  } catch (err) {
    console.warn('e2e identity restore failed', err)
    return null
  }
}

const persistIdentityForUser = (userId, identity) => {
  if (typeof window === 'undefined' || !userId || !identity) return
  try {
    window.localStorage.setItem(keyStorageForUser(userId), JSON.stringify(identity))
  } catch (err) {
    console.warn('e2e identity persist failed', err)
  }
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const canBootstrapChannelKey = ({ channelId, me, channel, users }) => {
  if (!channelId || !me?.id) return false
  if (channelId.startsWith('dm:')) {
    const parsed = parseDirectChannelId(channelId)
    return Boolean(parsed && (parsed.first === me.id || parsed.second === me.id))
  }
  if (channel?.isPrivate) return channel.createdBy === me.id
  const knownIds = Array.isArray(users) ? users.map((u) => u?.id).filter(Boolean).sort() : []
  if (!knownIds.length) return false
  return knownIds[0] === me.id
}

const enc = {
  setKeyForChannel: (cid, keyStr) => {
    if (typeof window === 'undefined' || !cid || !keyStr) return
    window.localStorage.setItem(storageKeyForChannel(cid), keyStr)
  },
  getKeyForChannel: (cid) => {
    if (typeof window === 'undefined' || !cid) return null
    return window.localStorage.getItem(storageKeyForChannel(cid))
  },
  ensureKey: (cid) => enc.getKeyForChannel(cid),
  generateKeyForChannel: (cid) => {
    if (!cid) return null
    const keyStr = randomSecretKeyB64()
    enc.setKeyForChannel(cid, keyStr)
    return keyStr
  },
  ensureIdentity: (userId) => {
    if (!userId) return null
    let identity = loadIdentityForUser(userId)
    if (identity) return identity
    const pair = nacl.box.keyPair()
    identity = {
      publicKey: u8.encodeBase64(pair.publicKey),
      secretKey: u8.encodeBase64(pair.secretKey.subarray(0, 32)),
    }
    persistIdentityForUser(userId, identity)
    return identity
  },
  wrapChannelKeyForUser: (channelKeyB64, recipientPublicKeyB64, senderSecretKeyB64) => {
    const channelKey = u8.decodeBase64(channelKeyB64)
    const recipientPublicKey = u8.decodeBase64(recipientPublicKeyB64)
    const senderSecretKey32 = u8.decodeBase64(senderSecretKeyB64)
    const senderFullSecret = nacl.box.keyPair.fromSecretKey(senderSecretKey32).secretKey
    const nonce = nacl.randomBytes(24)
    const box = nacl.box(channelKey, nonce, recipientPublicKey, senderFullSecret)
    return { wrappedKey: u8.encodeBase64(box), nonce: u8.encodeBase64(nonce) }
  },
  unwrapChannelKey: ({ wrappedKey, nonce, senderPublicKey, recipientSecretKey }) => {
    const wrapped = u8.decodeBase64(wrappedKey)
    const nonceBytes = u8.decodeBase64(nonce)
    const senderPublic = u8.decodeBase64(senderPublicKey)
    const recipientSecret32 = u8.decodeBase64(recipientSecretKey)
    const recipientFullSecret = nacl.box.keyPair.fromSecretKey(recipientSecret32).secretKey
    const opened = nacl.box.open(wrapped, nonceBytes, senderPublic, recipientFullSecret)
    return opened ? u8.encodeBase64(opened) : null
  },
  encrypt: (cid, text) => {
    const keyStr = enc.ensureKey(cid)
    if (!keyStr) return null
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
  voiceServerUrl: loadVoiceServerUrl() || import.meta.env.VITE_VOICE_SERVER || 'http://localhost:4010',
  serverModalOpen: false,
  accessToken: initialAuth.accessToken,
  refreshToken: initialAuth.refreshToken,
  token: initialAuth.accessToken,  // keep for backward compatibility
  user: initialAuth.user,
  e2eReady: false,
  userStatus: loadUserStatus(),
  profileBackground: loadProfileBackground(),
  profileStatus: loadProfileStatus(),
  nameStyle: loadNameStyle(),
  notificationSettings: loadNotificationSettings(),
  audioInputDeviceId: loadAudioInputDeviceId(),
  audioOutputDeviceId: loadAudioOutputDeviceId(),
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

  setAuth: (accessTokenOrToken, user, options = {}) => {
    const normalized = normalizeUser(user)
    const shouldPersist = options.persist ?? true
    // Support both old format (single token) and new format (accessToken, refreshToken as user.refreshToken)
    let accessToken = accessTokenOrToken
    let refreshToken = user?.refreshToken || options.refreshToken
    
    if (accessToken && normalized && shouldPersist) persistAuth(accessToken, refreshToken, normalized)
    else if (!accessToken || !shouldPersist) persistAuth(null, null, null)
    if (normalized?.nameStyle) persistNameStyle(normalized.nameStyle)
    if (typeof normalized?.profileStatus === 'string') persistProfileStatus(normalized.profileStatus)
    if (typeof normalized?.profileBackground === 'string') persistProfileBackground(normalized.profileBackground)
    if (typeof normalized?.userStatus === 'string') persistUserStatus(normalized.userStatus)
    set((state) => {
      let list = state.users
      if (normalized) {
        const exists = list.some((u) => u.id === normalized.id)
        list = exists ? list.map((u) => (u.id === normalized.id ? normalized : u)) : [...list, normalized]
      }
      return {
        accessToken,
        refreshToken,
        token: accessToken,  // keep for backward compatibility
        user: normalized,
        nameStyle: normalized?.nameStyle || state.nameStyle,
        profileStatus: normalized?.profileStatus ?? state.profileStatus,
        profileBackground: normalized?.profileBackground ?? state.profileBackground,
        userStatus: normalized?.userStatus ?? state.userStatus,
        users: list,
        view: 'chat',
      }
    })
    if (accessToken && normalized?.id) {
      Promise.resolve()
        .then(() => get().ensureE2EIdentity())
        .catch((err) => console.warn('ensure e2e identity after auth failed', err))
    }
  },
  setView: (view) => set({ view }),
  setUserStatus: (status) => {
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : ''
    if (!['online', 'idle', 'dnd', 'invisible'].includes(normalized)) return
    persistUserStatus(normalized)
    set((state) => ({
      userStatus: normalized,
      user: state.user ? { ...state.user, userStatus: normalized } : state.user,
      users: state.user?.id
        ? state.users.map((u) => (u.id === state.user.id ? { ...u, userStatus: normalized } : u))
        : state.users,
    }))
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
    const draft = {
      font: DEFAULT_NAME_STYLE.font,
      effect: DEFAULT_NAME_STYLE.effect,
      color: DEFAULT_NAME_STYLE.color,
      ...(typeof patch === 'object' && patch ? patch : {}),
    }
    const next = normalizeNameStyle(draft)
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
    const payload = normalizeNameStyle({
      font: typeof style?.font === 'string' ? style.font : DEFAULT_NAME_STYLE.font,
      effect: typeof style?.effect === 'string' ? style.effect : DEFAULT_NAME_STYLE.effect,
      color: typeof style?.color === 'string' ? style.color : DEFAULT_NAME_STYLE.color,
    })
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
  setAudioInputDeviceId: (deviceId) => {
    const normalized = typeof deviceId === 'string' && deviceId.trim() ? deviceId : 'default'
    persistAudioInputDeviceId(normalized)
    set({ audioInputDeviceId: normalized })
  },
  setAudioOutputDeviceId: (deviceId) => {
    const normalized = typeof deviceId === 'string' && deviceId.trim() ? deviceId : 'default'
    persistAudioOutputDeviceId(normalized)
    set({ audioOutputDeviceId: normalized })
  },
  setNotificationSettings: (patch) => {
    set((state) => {
      const previous = normalizeNotificationSettings(state.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS)
      const nextRaw = typeof patch === 'function' ? patch(previous) : { ...previous, ...(patch || {}) }
      const next = normalizeNotificationSettings(nextRaw)
      persistNotificationSettings(next)
      return { notificationSettings: next }
    })
  },
  resetNotificationSettings: () => {
    const next = normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS)
    persistNotificationSettings(next)
    set({ notificationSettings: next })
  },
  setServerUrl: (nextUrl, options = {}) => {
    const raw = typeof nextUrl === 'string' ? nextUrl.trim() : ''
    if (!raw) return false
    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`
    const previous = get().serverUrl
    const serverChanged = typeof previous === 'string' && previous.trim() !== normalized
    persistServerUrl(normalized)
    set({ serverUrl: normalized })
    if (serverChanged && (get().accessToken || get().token)) {
      // Tokens are server-specific; force clean login on server switch.
      get().logout()
      return true
    }
    if (options.reconnect && (get().accessToken || get().token)) {
      get().connect()
    }
    return true
  },
  setVoiceServerUrl: (nextUrl) => {
    const raw = typeof nextUrl === 'string' ? nextUrl.trim() : ''
    if (!raw) return false
    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `http://${raw}`
    persistVoiceServerUrl(normalized)
    set({ voiceServerUrl: normalized })
    return true
  },
  openServerModal: () => set({ serverModalOpen: true }),
  closeServerModal: () => set({ serverModalOpen: false }),
  openProfile: () => set({ view: 'profile' }),
  openSettings: () => set({ view: 'settings' }),
  openChat: () => set({ view: 'chat' }),
  syncPushNotifications: async () => {
    const token = get().accessToken || get().token
    const serverUrl = get().serverUrl
    const pushEnabled = get().notificationSettings?.pushEnabled !== false
    if (!token || !serverUrl) return false
    try {
      if (!pushEnabled) {
        await removeWebPushSubscription({ serverUrl, token }).catch(() => {})
        return false
      }
      return await syncWebPushSubscription({ serverUrl, token })
    } catch (err) {
      console.warn('web push sync failed', err)
      return false
    }
  },
  openAdmin: () => {
    if (get().user?.role !== 'admin') return
    set({ view: 'admin' })
  },
  logout: () => {
    const logoutToken = get().accessToken || get().token
    const logoutServerUrl = get().serverUrl
    Promise.resolve()
      .then(() => removeWebPushSubscription({ serverUrl: logoutServerUrl, token: logoutToken }))
      .catch(() => {})
    persistAuth(null, null, null)
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
      accessToken: null,
      refreshToken: null,
      token: null,
      user: null,
      e2eReady: false,
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
  ensureE2EIdentity: async () => {
    const user = get().user
    const token = get().token
    if (!user?.id || !token) return null
    const identity = enc.ensureIdentity(user.id)
    if (!identity) return null
    const currentPublic = typeof user.publicKey === 'string' ? user.publicKey : ''
    if (currentPublic !== identity.publicKey) {
      try {
        const { data } = await axios.post(
          `${get().serverUrl}/api/profile/e2e-key`,
          { publicKey: identity.publicKey },
          { headers: buildAuthHeaders(token) },
        )
        const normalized = normalizeUser(data?.user)
        if (normalized) {
          set((state) => ({
            user: state.user?.id === normalized.id ? { ...state.user, ...normalized } : state.user,
            users: state.users.some((u) => u.id === normalized.id)
              ? state.users.map((u) => (u.id === normalized.id ? { ...u, ...normalized } : u))
              : [...state.users, normalized],
            e2eReady: true,
          }))
        } else {
          set({ e2eReady: true })
        }
      } catch (err) {
        console.error('e2e public key sync failed', err)
        return null
      }
    } else {
      set({ e2eReady: true })
    }
    return identity
  },
  ensureChannelKey: async (channelId, options = {}) => {
    if (!channelId) return null
    const existing = enc.getKeyForChannel(channelId)
    const token = get().token
    const me = get().user
    if (!token || !me?.id) return existing || null
    const identity = await get().ensureE2EIdentity()
    if (!identity) return null
    const fetchSharedKey = async () => {
      const { data } = await axios.get(`${get().serverUrl}/api/channels/${encodeURIComponent(channelId)}/e2e-key`, {
        headers: buildAuthHeaders(token),
      })
      const key = data?.key
      if (key?.wrappedKey && key?.nonce && key?.senderPublicKey) {
        const unwrapped = enc.unwrapChannelKey({
          wrappedKey: key.wrappedKey,
          nonce: key.nonce,
          senderPublicKey: key.senderPublicKey,
          recipientSecretKey: identity.secretKey,
        })
        if (unwrapped) {
          enc.setKeyForChannel(channelId, unwrapped)
          return { status: 'ok', key: unwrapped }
        }
        return { status: 'unwrap_failed', key: null }
      }
      return { status: 'not_found', key: null }
    }
    let fetchStatus = 'unknown'
    try {
      const shared = await fetchSharedKey()
      fetchStatus = shared?.status || 'unknown'
      if (shared?.status === 'ok' && shared?.key) return shared.key
      if (shared?.status === 'unwrap_failed') return existing || null
    } catch (err) {
      const code = err?.response?.status
      fetchStatus = code === 404 ? 'not_found' : 'error'
      if (code !== 404) console.warn('fetch e2e channel key failed', err)
      if (existing) return existing
    }

    if (!options?.bootstrap && existing) return existing

    // Bootstrap only when server explicitly says there is no key.
    // Never rotate channel key after transport/server errors or unwrap mismatch.
    if (!options?.bootstrap || fetchStatus !== 'not_found') return existing || null

    const channel = (get().channels || []).find((c) => c.id === channelId)
    const canBootstrap = canBootstrapChannelKey({
      channelId,
      me,
      channel,
      users: get().users || [],
    })
    if (!canBootstrap) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitMs(350 * (attempt + 1))
        try {
          const shared = await fetchSharedKey()
          if (shared?.status === 'ok' && shared?.key) return shared.key
          if (shared?.status === 'unwrap_failed') return null
          if (shared?.status !== 'not_found') return null
        } catch (err) {
          const code = err?.response?.status
          if (code && code !== 404) console.warn('retry fetch e2e channel key failed', err)
          if (code && code !== 404) return null
        }
      }
      return null
    }

    const channelKey = enc.generateKeyForChannel(channelId)
    if (!channelKey) return null

    const recipients = new Map()
    let users = get().users || []
    const byId = new Map(users.map((u) => [u.id, u]))

    if (channelId.startsWith('dm:')) {
      const parsed = parseDirectChannelId(channelId)
      const missingDmPublicKey = Boolean(
        parsed?.second &&
        parsed.second !== me.id &&
        (!byId.get(parsed.second)?.publicKey || typeof byId.get(parsed.second)?.publicKey !== 'string'),
      )
      if (missingDmPublicKey) {
        try {
          const { data } = await axios.get(`${get().serverUrl}/api/users`, { headers: buildAuthHeaders(token) })
          const normalizedUsers = Array.isArray(data?.users) ? data.users.map(normalizeUser).filter(Boolean) : []
          if (normalizedUsers.length) {
            users = normalizedUsers
            set((state) => {
              const current = state.user ? normalizedUsers.find((u) => u.id === state.user.id) || state.user : state.user
              return { users: normalizedUsers, user: current }
            })
          }
        } catch (err) {
          console.warn('users fetch for dm e2e bootstrap failed', err)
        }
      }
      const refreshedById = new Map((users || []).map((u) => [u.id, u]))
      if (parsed?.first) recipients.set(parsed.first, refreshedById.get(parsed.first))
      if (parsed?.second) recipients.set(parsed.second, refreshedById.get(parsed.second))
    } else if (channel?.isPrivate) {
      let members = get().channelMembers[channelId] || []
      if (!members.length) {
        try {
          members = await get().fetchChannelMembers(channelId)
        } catch (_) {
          members = []
        }
      }
      members.forEach((entry) => {
        const user = entry?.user
        if (user?.id) recipients.set(user.id, user)
      })
      if (channel?.createdBy) recipients.set(channel.createdBy, byId.get(channel.createdBy))
    } else {
      users.forEach((u) => {
        if (u?.id) recipients.set(u.id, u)
      })
    }

    recipients.set(me.id, byId.get(me.id) || me)
    const shares = []
    recipients.forEach((target, userId) => {
      if (!userId || !target?.publicKey) return
      try {
        const wrapped = enc.wrapChannelKeyForUser(channelKey, target.publicKey, identity.secretKey)
        shares.push({ userId, wrappedKey: wrapped.wrappedKey, nonce: wrapped.nonce, keyVersion: 1 })
      } catch (err) {
        console.warn('channel key wrap failed', userId, err)
      }
    })
    if (!shares.length) return null
    await axios.post(
      `${get().serverUrl}/api/channels/${encodeURIComponent(channelId)}/e2e-keys`,
      { shares },
      { headers: buildAuthHeaders(token) },
    )
    return channelKey
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
  buildMediaUrl: (relativeUrl) => {
    if (!relativeUrl || typeof relativeUrl !== 'string') return null
    try {
      if (relativeUrl.startsWith('blob:') || relativeUrl.startsWith('data:')) return relativeUrl
      const server = get().serverUrl
      const base = server.endsWith('/') ? server : `${server}/`
      return new URL(relativeUrl, base).toString()
    } catch (err) {
      console.error('media url build failed', err)
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
  refreshAccessToken: async () => {
    const refreshToken = get().refreshToken
    if (!refreshToken) {
      get().logout()
      return false
    }
    try {
      const server = get().serverUrl
      const { data } = await axios.post(`${server}/api/refresh`, { refreshToken })
      const newAccessToken = data.accessToken
      if (!newAccessToken) {
        get().logout()
        return false
      }
      // Update accessToken in store
      set({ accessToken: newAccessToken, token: newAccessToken })
      // Update in localStorage
      const user = get().user
      persistAuth(newAccessToken, refreshToken, user)
      console.log('[REFRESH] access token renewed')
      return true
    } catch (err) {
      console.warn('[REFRESH] failed', err.message)
      get().logout()
      return false
    }
  },
  connect: async () => {
    const accessToken = get().accessToken
    if (!accessToken) return
    const server = get().serverUrl
    get().cancelReconnectCountdown()
    const existingSocket = get().socket
    if (existingSocket) {
      if (typeof existingSocket.removeAllListeners === 'function') existingSocket.removeAllListeners()
      if (existingSocket.io?.off) existingSocket.io.off('close')
      existingSocket.disconnect()
    }
    set({ connectionStatus: 'connecting', connectionError: null })
    const socket = io(server, {
      auth: { accessToken },
      reconnection: false,
      transports: ['websocket'],
    })
    set({ socket })
    const manager = socket.io
    let handleCloseRef = null

    const normalizeSocketError = (error) => {
      if (!error) return null
      if (typeof error === 'string') return error
      const parts = []
      if (error.message) parts.push(String(error.message))
      if (error.description) parts.push(String(error.description))
      if (error.data) {
        try {
          parts.push(typeof error.data === 'string' ? error.data : JSON.stringify(error.data))
        } catch (_) {}
      }
      const result = parts.join(' | ').trim()
      return result || null
    }

    const scheduleReconnect = (error) => {
      if (!get().accessToken) return
      const message = normalizeSocketError(error)
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
          const { data } = await axios.get(`${server}/api/users`, { headers: buildAuthHeaders(get().accessToken) })
        const normalized = (data.users || []).map(normalizeUser).filter(Boolean)
        set((state) => {
          const current = state.user ? normalized.find((u) => u.id === state.user.id) || state.user : state.user
          return { users: normalized, user: current }
        })
        await get().ensureE2EIdentity()
        get().syncPushNotifications().catch(() => {})
        } catch (err) {
          console.error('users fetch failed', err)
        }
      })

      socket.on('connect_error', (err) => {
        console.warn('[SOCKET] connect_error', {
          message: err?.message,
          description: err?.description,
          data: err?.data,
          context: err?.context,
        })
        const rawMessage = String(err?.message || '').toLowerCase()
        const rawDescription = String(err?.description || '').toLowerCase()
        const rawData = String(
          typeof err?.data === 'string' ? err.data : (() => {
            try {
              return JSON.stringify(err?.data || '')
            } catch (_) {
              return ''
            }
          })(),
        ).toLowerCase()
        const authFailure =
          rawMessage.includes('invalid_token') ||
          rawMessage.includes('no_token') ||
          rawDescription.includes('invalid_token') ||
          rawDescription.includes('no_token') ||
          rawData.includes('invalid_token') ||
          rawData.includes('no_token')
        if (authFailure) {
          console.warn('[SOCKET] auth failure on connect, trying token refresh')
          get()
            .refreshAccessToken()
            .then((ok) => {
              if (!ok) {
                console.warn('[SOCKET] refresh failed after socket auth error, forcing logout')
                get().logout()
                return
              }
              const existing = get().socket
              if (existing) {
                if (typeof existing.removeAllListeners === 'function') existing.removeAllListeners()
                if (existing.io?.off) existing.io.off('close')
                existing.disconnect()
              }
              get().cancelReconnectCountdown()
              set({ reconnectAttempt: 0, connectionStatus: 'connecting', connectionError: null })
              get().connect()
            })
            .catch(() => {
              get().logout()
            })
          return
        }
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

    socket.on('init:response', async ({ workspaces, channels, activeChannelId, messages }) => {
      if (activeChannelId) await get().ensureChannelKey(activeChannelId, { bootstrap: false })
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

    socket.on('channel:opened', async ({ channelId, messages }) => {
      await get().ensureChannelKey(channelId, { bootstrap: false })
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

    socket.on('messages:page', async ({ channelId, messages, limit = 50 }) => {
      await get().ensureChannelKey(channelId, { bootstrap: false })
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

    socket.on('message:new', async (payload) => {
      await get().ensureChannelKey(payload.channelId, { bootstrap: false })
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

    socket.on('message:updated', async (payload) => {
      await get().ensureChannelKey(payload.channelId, { bootstrap: false })
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
        const friends = state.friends.some((friend) => friend.id === normalized.id)
          ? state.friends.map((friend) => (friend.id === normalized.id ? { ...friend, ...normalized } : friend))
          : state.friends
        const isSelf = state.user?.id === normalized.id
        const nameStyle = isSelf ? normalized.nameStyle : state.nameStyle
        const patch = { users, user, friends, nameStyle }
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
          if (typeof normalized.userStatus === 'string') {
            persistUserStatus(normalized.userStatus)
            patch.userStatus = normalized.userStatus
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
    Promise.resolve()
      .then(() => get().ensureChannelKey(channelId, { bootstrap: false }))
      .catch(() => {})
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
    Promise.resolve()
      .then(() => get().ensureChannelKey(channelId, { bootstrap: true }))
      .catch(() => {})
  },

  sendMessage: async (content, replyTo = null) => {
    const socket = get().socket
    const channelId = get().activeChannelId
    if (!socket || !channelId || !content.trim()) return
    await get().ensureChannelKey(channelId, { bootstrap: true })
    const encrypted = enc.encrypt(channelId, content.trim())
    if (!encrypted) throw new Error('e2e_key_unavailable')
    socket.emit('message:send', { channelId, content: encrypted, replyTo: replyTo || null })
  },

  editMessage: async (messageId, channelId, content, replyTo = undefined) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) throw new Error('invalid_content')
    await get().ensureChannelKey(channelId, { bootstrap: false })
    const encrypted = enc.encrypt(channelId, trimmed)
    if (!encrypted) throw new Error('e2e_key_unavailable')
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
    if (channel?.id) {
      await get().ensureChannelKey(channel.id, { bootstrap: true })
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
  uploadMedia: async (file, onProgress) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    if (!file) throw new Error('invalid_media')
    const MAX_CHUNK = 25 * 1024 * 1024 // 25 MB
    // small file -> single upload (server will store encrypted)
    if (typeof file.size === 'number' && file.size <= MAX_CHUNK) {
      const form = new FormData()
      form.append('file', file)
      const { data } = await axios.post(`${get().serverUrl}/api/media`, form, {
        headers: buildAuthHeaders(token),
        onUploadProgress: (progressEvent) => {
          try {
            if (typeof onProgress === 'function' && progressEvent?.total) {
              const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
              onProgress(percent)
            }
          } catch (_) {}
        },
      })
      return data?.media || null
    }

    // large file -> chunked upload
    const totalSize = file.size || 0
    const totalChunks = Math.ceil(totalSize / MAX_CHUNK)
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    let uploadedBytes = 0
    for (let idx = 0; idx < totalChunks; idx += 1) {
      const start = idx * MAX_CHUNK
      const end = Math.min(totalSize, (idx + 1) * MAX_CHUNK)
      const chunkBlob = file.slice(start, end)
      const form = new FormData()
      form.append('chunk', chunkBlob, file.name)
      form.append('uploadId', uploadId)
      form.append('index', String(idx))
      form.append('total', String(totalChunks))
      form.append('filename', file.name)
      form.append('mime', file.type || 'application/octet-stream')
      // send chunk
      const resp = await axios.post(`${get().serverUrl}/api/media/chunk`, form, {
        headers: buildAuthHeaders(token),
        onUploadProgress: (progressEvent) => {
          try {
            if (typeof onProgress === 'function' && progressEvent?.total) {
              const percentChunk = (progressEvent.loaded / progressEvent.total) || 0
              const overall = Math.round(((uploadedBytes + percentChunk * (end - start)) / totalSize) * 100)
              onProgress(overall)
            }
          } catch (_) {}
        },
      })
      // if server returns assembled media on final chunk, return it
      if (resp?.data?.media) return resp.data.media
      uploadedBytes += (end - start)
    }
    // if loop finishes without final response, try to fetch assembled media by uploadId (best-effort)
    // server returns media only when assembly completes; otherwise throw
    throw new Error('upload_failed')
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

  updateUserStatus: async (status) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : ''
    const { data } = await axios.post(
      `${get().serverUrl}/api/profile/presence-status`,
      { status: normalized },
      { headers: buildAuthHeaders(token) },
    )
    const updated = normalizeUser(data.user ?? data)
    if (!updated) return null
    persistUserStatus(updated.userStatus || 'online')
    set((state) => ({
      userStatus: updated.userStatus || 'online',
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
