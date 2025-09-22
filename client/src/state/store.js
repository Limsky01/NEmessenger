import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'

const encoder = new TextEncoder()
const storageKeyForChannel = (cid) => `chkey:${cid}`

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
  getKeyForChannel: (cid) => {
    const stored = localStorage.getItem(storageKeyForChannel(cid))
    return stored || deriveKey(cid)
  },
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
      const [, nB, bB] = payload.split(':')
      const nonce = u8.decodeBase64(nB)
      const box = u8.decodeBase64(bB)
      const key = u8.decodeBase64(keyStr)
      const opened = nacl.secretbox.open(box, nonce, key)
      return opened ? u8.encodeUTF8(opened) : '[Decryption failed]'
    } catch (err) {
      console.error('decrypt error', err)
      return '[Decryption failed]'
    }
  },
  generateKey: () => u8.encodeBase64(nacl.randomBytes(32))
}

const useStore = create((set, get) => ({
  serverUrl: import.meta.env.VITE_LGM_SERVER || 'http://localhost:4000',
  token: null,
  user: null,
  users: [],
  socket: null,
  workspaces: [],
  channels: [],
  activeChannelId: null,
  messages: {},
  unread: {},
  onlineUserIds: [],
  historyLoading: {},
  historyComplete: {},
  setAuth: (token, user) => set({ token, user }),
  setChannelKey: (cid, keyStr) => enc.setKeyForChannel(cid, keyStr),
  getChannelKey: (cid) => enc.getKeyForChannel(cid),

  connect: async () => {
    const token = get().token
    const server = get().serverUrl
    const s = io(server, { auth: { token } })
    set({ socket: s })
    s.on('connect', async () => {
      s.emit('init:request', {})
      const users = await axios.get(`${server}/api/users`, { headers: { Authorization: `Bearer ${get().token}` } })
      set({ users: users.data.users })
    })
    s.on('init:response', ({ workspaces, channels, activeChannelId, messages }) => {
      const dec = (m) => ({ ...m, content: enc.decrypt(activeChannelId, m.content) })
      set({
        workspaces,
        channels,
        activeChannelId,
        messages: activeChannelId ? { [activeChannelId]: messages.map(dec) } : {},
        unread: {},
        historyComplete: activeChannelId ? { [activeChannelId]: messages.length < 50 } : {},
        historyLoading: {}
      })
    })
    s.on('channel:opened', ({ channelId, messages }) => {
      const dec = (m) => ({ ...m, content: enc.decrypt(channelId, m.content) })
      set((st) => ({
        activeChannelId: channelId,
        messages: { ...st.messages, [channelId]: messages.map(dec) },
        unread: { ...st.unread, [channelId]: 0 },
        historyLoading: { ...st.historyLoading, [channelId]: false },
        historyComplete: { ...st.historyComplete, [channelId]: messages.length < 50 }
      }))
    })
    s.on('messages:page', ({ channelId, messages, limit = 50 }) => {
      const dec = messages.map((m) => ({ ...m, content: enc.decrypt(channelId, m.content) }))
      set((st) => {
        const existing = st.messages[channelId] || []
        const known = new Set(existing.map((m) => m.id))
        const merged = [...dec.filter((m) => !known.has(m.id)), ...existing]
        return {
          messages: { ...st.messages, [channelId]: merged },
          historyLoading: { ...st.historyLoading, [channelId]: false },
          historyComplete: { ...st.historyComplete, [channelId]: dec.length < limit }
        }
      })
    })
    s.on('message:new', (m) => {
      const dec = { ...m, content: enc.decrypt(m.channelId, m.content) }
      set((st) => {
        const arr = st.messages[m.channelId] || []
        const isActive = st.activeChannelId === m.channelId
        return {
          messages: { ...st.messages, [m.channelId]: [...arr, dec] },
          unread: { ...st.unread, [m.channelId]: isActive ? 0 : (st.unread[m.channelId] || 0) + 1 }
        }
      })
    })
    s.on('presence:update', ({ onlineUserIds }) => set({ onlineUserIds }))
  },
  switchChannel: (channelId) => {
    const s = get().socket
    if (!s || !channelId) return
    set((st) => ({
      activeChannelId: channelId,
      unread: { ...st.unread, [channelId]: 0 }
    }))
    s.emit('channel:switch', { channelId })
  },
  sendMessage: (content) => {
    const s = get().socket
    const cid = get().activeChannelId
    if (!s || !cid || !content.trim()) return
    const encrypted = enc.encrypt(cid, content.trim())
    s.emit('message:send', { channelId: cid, content: encrypted })
  },
  loadMore: () => {
    const s = get().socket
    const cid = get().activeChannelId
    if (!s || !cid) return
    const { historyLoading, historyComplete, messages } = get()
    if (historyLoading[cid] || historyComplete[cid]) return
    const cur = (messages[cid] || []).length
    set((st) => ({ historyLoading: { ...st.historyLoading, [cid]: true } }))
    s.emit('messages:load', { channelId: cid, limit: 50, offset: cur })
  },

  // Admin
  fetchFiles: async () => {
    const { data } = await axios.get(`${get().serverUrl}/api/admin/files`, { headers: { Authorization: `Bearer ${get().token}` } })
    return data.files
  },
  deleteFile: async (id) => {
    await axios.delete(`${get().serverUrl}/api/admin/files/${id}`, { headers: { Authorization: `Bearer ${get().token}` } })
  },
  deleteUser: async (id) => {
    await axios.delete(`${get().serverUrl}/api/admin/users/${id}`, { headers: { Authorization: `Bearer ${get().token}` } })
  },

  // Upload (chunked)
  uploadFile: async (file, onProgress) => {
    const server = get().serverUrl
    const token = get().token
    const init = await axios.post(`${server}/api/upload/init`, { filename: file.name, size: file.size, mime: file.type }, { headers: { Authorization: `Bearer ${token}` } })
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
      await fetch(`${server}/api/upload/chunk`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
      uploaded += slice.size
      idx += 1
      onProgress && onProgress(Math.round((uploaded / file.size) * 100))
    }
    const done = await axios.post(`${server}/api/upload/complete`, { uploadId: id, filename: file.name, mime: file.type }, { headers: { Authorization: `Bearer ${token}` } })
    return done.data.fileId
  }
}))
export default useStore
