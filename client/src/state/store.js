import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'

const encoder = new TextEncoder()
const storageKeyForChannel = (cid) => `chkey:${cid}`

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

const normalizeUser = (raw) => {
  if (!raw) return null
  return {
    id: raw.id,
    username: raw.username,
    role: raw.role,
    avatarSeed: raw.avatarSeed ?? raw.avatar_seed ?? '',
    avatarUrl: raw.avatarUrl ?? raw.avatar_url ?? '',
    avatarUpdatedAt: raw.avatarUpdatedAt ?? raw.avatar_updated_at ?? 0,
  }
}

const normalizeFileMeta = (raw) => {
  if (!raw) return null
  const name = raw.name ?? raw.originalName ?? raw.original_name ?? raw.filename ?? 'file'
  return {
    id: raw.id,
    name,
    mime: raw.mime || raw.type || '',
    size: raw.size ?? 0,
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

const formatMessage = (fallbackChannelId) => (raw) => {
  if (!raw) return null
  const channelId = raw.channelId ?? raw.channel_id ?? fallbackChannelId
  const senderId = raw.senderId ?? raw.sender_id ?? raw.user_id ?? null
  const createdAt = raw.createdAt ?? raw.created_at ?? Date.now()
  return {
    id: raw.id,
    channelId,
    senderId,
    createdAt,
    content: enc.decrypt(channelId, raw.content),
  }
}

const buildAuthHeaders = (token) => ({ Authorization: `Bearer ${token}` })

const useStore = create((set, get) => ({
  serverUrl: import.meta.env.VITE_LGM_SERVER || 'http://localhost:4000',
  token: null,
  user: null,
  users: [],
  view: 'chat',
  socket: null,
  workspaces: [],
  channels: [],
  activeChannelId: null,
  messages: {},
  unread: {},
  onlineUserIds: [],
  historyLoading: {},
  historyComplete: {},
  directPeers: {},
  files: {},

  setAuth: (token, user) => set((state) => {
    const normalized = normalizeUser(user)
    let list = state.users
    if (normalized) {
      const exists = list.some((u) => u.id === normalized.id)
      list = exists ? list.map((u) => (u.id === normalized.id ? normalized : u)) : [...list, normalized]
    }
    return {
      token,
      user: normalized,
      users: list,
      view: 'chat',
    }
  }),
  setView: (view) => set({ view }),
  openProfile: () => set({ view: 'profile' }),
  openChat: () => set({ view: 'chat' }),
  openAdmin: () => {
    if (get().user?.role !== 'admin') return
    set({ view: 'admin' })
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

  connect: async () => {
    const token = get().token
    if (!token) return
    const server = get().serverUrl
    const socket = io(server, { auth: { token } })
    set({ socket })

    socket.on('connect', async () => {
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

    socket.on('init:response', ({ workspaces, channels, activeChannelId, messages }) => {
      const normalize = formatMessage(activeChannelId)
      set({
        workspaces,
        channels,
        activeChannelId,
        messages: activeChannelId ? { [activeChannelId]: messages.map(normalize).filter(Boolean) } : {},
        unread: {},
        historyComplete: activeChannelId ? { [activeChannelId]: messages.length < 50 } : {},
        historyLoading: {},
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
        const arr = state.messages[payload.channelId] || []
        const isActive = state.activeChannelId === payload.channelId
        const nextUnread = isActive ? 0 : (state.unread[payload.channelId] || 0) + 1
        const result = {
          messages: { ...state.messages, [payload.channelId]: [...arr, normalized] },
          unread: { ...state.unread, [payload.channelId]: nextUnread },
        }
        if (payload.channelId?.startsWith('dm:')) {
          const peerId = peerFromDirectChannel(payload.channelId, state.user?.id)
          if (peerId) result.directPeers = { ...state.directPeers, [payload.channelId]: peerId }
        }
        return result
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

    socket.on('user:update', (payload) => {
      const normalized = normalizeUser(payload)
      if (!normalized) return
      set((state) => {
        const users = state.users.some((u) => u.id === normalized.id)
          ? state.users.map((u) => (u.id === normalized.id ? { ...u, ...normalized } : u))
          : [...state.users, normalized]
        const user = state.user?.id === normalized.id ? { ...state.user, ...normalized } : state.user
        return { users, user }
      })
    })

    socket.on('presence:update', ({ onlineUserIds }) => set({ onlineUserIds }))
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
    const channelId = buildDirectChannelId(me.id, userId)
    set((state) => ({
      activeChannelId: channelId,
      unread: { ...state.unread, [channelId]: 0 },
      directPeers: { ...state.directPeers, [channelId]: userId },
      view: 'chat',
    }))
    socket.emit('channel:switch', { channelId })
  },

  sendMessage: (content) => {
    const socket = get().socket
    const channelId = get().activeChannelId
    if (!socket || !channelId || !content.trim()) return
    const encrypted = enc.encrypt(channelId, content.trim())
    socket.emit('message:send', { channelId, content: encrypted })
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

  // Admin helpers
  fetchFiles: async () => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.get(`${get().serverUrl}/api/admin/files`, { headers: buildAuthHeaders(token) })
    return data.files
  },
  deleteFile: async (id) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    await axios.delete(`${get().serverUrl}/api/admin/files/${id}`, { headers: buildAuthHeaders(token) })
  },
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

  registerFileMeta: (file) => {
    const normalized = normalizeFileMeta(file)
    if (!normalized) return normalized
    set((state) => ({ files: { ...state.files, [normalized.id]: normalized } }))
    return normalized
  },

  ensureFileMeta: async (fileId) => {
    if (!fileId) return null
    const existing = get().files[fileId]
    if (existing) return existing
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.get(`${get().serverUrl}/api/files/${fileId}/meta`, {
      headers: buildAuthHeaders(token),
    })
    const normalized = normalizeFileMeta(data.file)
    if (normalized) {
      set((state) => ({ files: { ...state.files, [normalized.id]: normalized } }))
    }
    return normalized
  },

  buildFileUrl: (fileId, { inline = false } = {}) => {
    const { serverUrl, token } = get()
    if (!token || !fileId) return null
    const path = inline ? `/api/files/${fileId}/view` : `/api/files/${fileId}`
    const url = new URL(path, serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`)
    url.searchParams.set('token', token)
    return url.toString()
  },

  // Upload (chunked)
  uploadFile: async (file, onProgress) => {
    const server = get().serverUrl
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const headers = buildAuthHeaders(token)
    const init = await axios.post(
      `${server}/api/upload/init`,
      { filename: file.name, size: file.size, mime: file.type },
      { headers },
    )
    const id = init.data.uploadId
    const chunkSize = 10 * 1024 * 1024
    let uploaded = 0
    let idx = 0
    while (uploaded < file.size) {
      const slice = file.slice(uploaded, Math.min(uploaded + chunkSize, file.size))
      const form = new FormData()
      form.append('chunk', slice)
      form.append('uploadId', id)
      form.append('index', String(idx))
      await fetch(`${server}/api/upload/chunk`, {
        method: 'POST',
        headers: { Authorization: headers.Authorization },
        body: form,
      })
      uploaded += slice.size
      idx += 1
      if (onProgress) onProgress(Math.round((uploaded / file.size) * 100))
    }
    const done = await axios.post(
      `${server}/api/upload/complete`,
      { uploadId: id, filename: file.name, mime: file.type },
      { headers },
    )
    const filePayload = done.data.file || { id: done.data.fileId, name: file.name, mime: file.type, size: file.size }
    const normalized = normalizeFileMeta(filePayload)
    if (normalized) {
      set((state) => ({ files: { ...state.files, [normalized.id]: normalized } }))
    }
    return normalized
  },
}))

export default useStore








