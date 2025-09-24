import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'

const encoder = new TextEncoder()
const storageKeyForChannel = (cid) => `chkey:${cid}`
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const voicePeerConnections = new Map()

const loadStoredDevice = (key) => {
  try {
    return localStorage.getItem(key) || null
  } catch (err) {
    console.warn('audio device restore failed', err)
    return null
  }
}

const teardownVoicePeer = (socketId, set) => {
  const pc = voicePeerConnections.get(socketId)
  if (pc) {
    try {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
    } catch (err) {
      console.warn('peer close failed', err)
    }
    voicePeerConnections.delete(socketId)
  }
  set((state) => {
    if (!state.voiceRemoteStreams[socketId]) return state
    const next = { ...state.voiceRemoteStreams }
    delete next[socketId]
    return { voiceRemoteStreams: next }
  })
}

const setupVoicePeer = async ({ socket, roomId, participant, initiator, get, set }) => {
  if (!participant || participant.socketId === socket.id) return null
  let pc = voicePeerConnections.get(participant.socketId)
  if (pc) return pc
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  voicePeerConnections.set(participant.socketId, pc)
  const stream = get().voiceStream
  if (stream) {
    stream.getAudioTracks().forEach((track) => {
      try {
        pc.addTrack(track, stream)
      } catch (err) {
        console.error('addTrack failed', err)
      }
    })
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice:signal', { targetId: participant.socketId, data: { candidate: event.candidate } })
    }
  }

  pc.ontrack = (event) => {
    const [remoteStream] = event.streams
    if (!remoteStream) return
    set((state) => ({
      voiceRemoteStreams: {
        ...state.voiceRemoteStreams,
        [participant.socketId]: {
          stream: remoteStream,
          userId: participant.userId,
          username: participant.username,
        },
      },
    }))
  }

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      teardownVoicePeer(participant.socketId, set)
    }
  }

  if (initiator) {
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('voice:signal', { targetId: participant.socketId, data: { sdp: pc.localDescription } })
    } catch (err) {
      console.error('offer create failed', err)
    }
  }

  return pc
}

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
  audioDevices: { inputs: [], outputs: [] },
  audioInputDeviceId: loadStoredDevice('audioInputDeviceId'),
  audioOutputDeviceId: loadStoredDevice('audioOutputDeviceId'),
  voiceRooms: [],
  voiceParticipants: {},
  voiceRemoteStreams: {},
  activeVoiceRoomId: null,
  voiceStatus: null,
  voiceStream: null,
  invites: [],

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
  refreshAudioDevices: async () => {
    if (!navigator?.mediaDevices?.enumerateDevices) return
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter((d) => d.kind === 'audioinput')
      const outputs = devices.filter((d) => d.kind === 'audiooutput')
      set({ audioDevices: { inputs, outputs } })
    } catch (err) {
      console.error('enumerate devices failed', err)
    }
  },
  setAudioDevice: (type, deviceId) => {
    if (type === 'input') {
      try {
        if (deviceId) localStorage.setItem('audioInputDeviceId', deviceId)
        else localStorage.removeItem('audioInputDeviceId')
      } catch (err) {
        console.warn('audio device save failed', err)
      }
      set({ audioInputDeviceId: deviceId || null })
      return
    }
    if (type === 'output') {
      try {
        if (deviceId) localStorage.setItem('audioOutputDeviceId', deviceId)
        else localStorage.removeItem('audioOutputDeviceId')
      } catch (err) {
        console.warn('audio device save failed', err)
      }
      set({ audioOutputDeviceId: deviceId || null })
    }
  },
  joinVoiceRoom: async (roomId) => {
    const socket = get().socket
    if (!socket || !roomId) return
    if (get().activeVoiceRoomId === roomId) return
    if (get().activeVoiceRoomId) get().leaveVoiceRoom(false)
    try {
      if (!navigator?.mediaDevices?.getUserMedia) throw new Error('media_unsupported')
      const deviceId = get().audioInputDeviceId
      const constraints = deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      set({ voiceStream: stream, voiceStatus: 'connecting', activeVoiceRoomId: roomId })
      socket.emit('voice:join', { roomId })
    } catch (err) {
      console.error('joinVoiceRoom failed', err)
      set({ voiceStatus: 'error' })
    }
  },
  leaveVoiceRoom: (emit = true) => {
    const socket = get().socket
    const roomId = get().activeVoiceRoomId
    if (emit && socket && roomId) socket.emit('voice:leave')
    voicePeerConnections.forEach((_, id) => teardownVoicePeer(id, set))
    voicePeerConnections.clear()
    const stream = get().voiceStream
    if (stream) stream.getTracks().forEach((track) => track.stop())
    set((state) => ({
      activeVoiceRoomId: null,
      voiceStream: null,
      voiceStatus: null,
      voiceRemoteStreams: {},
      voiceParticipants: roomId ? { ...state.voiceParticipants, [roomId]: [] } : state.voiceParticipants,
    }))
  },
  createVoiceRoom: async (name) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('invalid_name')
    const { data } = await axios.post(
      `${get().serverUrl}/api/voice-rooms`,
      { name: trimmed },
      { headers: buildAuthHeaders(token) },
    )
    if (data?.room) {
      set((state) => ({ voiceRooms: [...state.voiceRooms.filter((room) => room.id !== data.room.id), data.room] }))
    }
  },
  deleteVoiceRoom: async (roomId) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    await axios.delete(`${get().serverUrl}/api/voice-rooms/${roomId}`, { headers: buildAuthHeaders(token) })
    set((state) => ({
      voiceRooms: state.voiceRooms.filter((room) => room.id !== roomId),
      voiceParticipants: { ...state.voiceParticipants, [roomId]: [] },
    }))
    if (get().activeVoiceRoomId === roomId) get().leaveVoiceRoom(false)
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
      try {
        const { data: voiceData } = await axios.get(`${server}/api/voice-rooms`, { headers: buildAuthHeaders(get().token) })
        set({ voiceRooms: (voiceData.rooms || []).map((room) => ({ ...room })) })
      } catch (err) {
        console.error('voice rooms fetch failed', err)
      }
      get().refreshAudioDevices()
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
    socket.on('voice:rooms:update', ({ rooms }) => {
      if (Array.isArray(rooms)) set({ voiceRooms: rooms.map((room) => ({ ...room })) })
    })
    socket.on('voice:state', ({ roomId, participants }) => {
      if (!roomId) return
      set((state) => ({
        voiceParticipants: { ...state.voiceParticipants, [roomId]: participants || [] },
        voiceRooms: state.voiceRooms.map((room) => (room.id === roomId ? { ...room, participantCount: (participants || []).length } : room)),
      }))
    })
    socket.on('voice:participants', async ({ roomId, participants }) => {
      if (!roomId) return
      set((state) => ({
        voiceParticipants: { ...state.voiceParticipants, [roomId]: participants || [] },
      }))
      if (get().activeVoiceRoomId !== roomId) return
      const list = participants || []
      for (const participant of list) {
        await setupVoicePeer({ socket, roomId, participant, initiator: true, get, set })
      }
    })
    socket.on('voice:user-joined', async ({ roomId, participant }) => {
      if (!roomId || !participant) return
      set((state) => ({
        voiceParticipants: {
          ...state.voiceParticipants,
          [roomId]: [...(state.voiceParticipants[roomId] || []), participant],
        },
      }))
      if (get().activeVoiceRoomId !== roomId) return
      await setupVoicePeer({ socket, roomId, participant, initiator: false, get, set })
    })
    socket.on('voice:user-left', ({ roomId, socketId }) => {
      if (!roomId || !socketId) return
      set((state) => ({
        voiceParticipants: {
          ...state.voiceParticipants,
          [roomId]: (state.voiceParticipants[roomId] || []).filter((p) => p.socketId !== socketId),
        },
      }))
      teardownVoicePeer(socketId, set)
    })
    socket.on('voice:signal', async ({ from, data }) => {
      if (!from || !data) return
      const roomId = get().activeVoiceRoomId
      if (!roomId) return
      let pc = voicePeerConnections.get(from)
      if (!pc) {
        const participant = (get().voiceParticipants[roomId] || []).find((p) => p.socketId === from) || {
          socketId: from,
          userId: from,
          username: 'Участник',
        }
        if (!participant) return
        pc = await setupVoicePeer({ socket, roomId, participant, initiator: false, get, set })
        if (!pc) return
      }
      if (data.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          if (data.sdp.type === 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit('voice:signal', { targetId: from, data: { sdp: pc.localDescription } })
          }
        } catch (err) {
          console.error('sdp handling failed', err)
        }
      }
      if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (err) {
          console.error('candidate add failed', err)
        }
      }
    })
    socket.on('voice:joined', ({ roomId }) => {
      if (!roomId) return
      set((state) => ({ voiceStatus: 'connected', activeVoiceRoomId: roomId }))
    })
    socket.on('voice:room-closed', ({ roomId }) => {
      if (get().activeVoiceRoomId === roomId) {
        get().leaveVoiceRoom(false)
        set({ voiceStatus: 'room_closed' })
      }
    })
    socket.on('voice:error', ({ error }) => set({ voiceStatus: error || 'error' }))
    socket.on('disconnect', () => {
      const stream = get().voiceStream
      if (stream) stream.getTracks().forEach((track) => track.stop())
      voicePeerConnections.forEach((_, id) => teardownVoicePeer(id, set))
      voicePeerConnections.clear()
      set({ voiceStream: null, activeVoiceRoomId: null, voiceRemoteStreams: {}, voiceStatus: 'disconnected' })
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








