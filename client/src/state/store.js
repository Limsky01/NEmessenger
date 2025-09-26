import { create } from 'zustand'
import { io } from 'socket.io-client'
import axios from 'axios'
import nacl from 'tweetnacl'
import * as u8 from 'tweetnacl-util'

const encoder = new TextEncoder()
const storageKeyForChannel = (cid) => `chkey:${cid}`
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const voicePeerConnections = new Map()
const speakingMonitors = new Map()
const RECONNECT_DELAYS = [5000, 10000, 20000]

let reconnectTimeoutId = null
let reconnectCountdownIntervalId = null

const ensureAudioContext = () => {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!ensureAudioContext.ctx) {
    try {
      ensureAudioContext.ctx = new AudioCtx()
    } catch (err) {
      console.warn('audio context init failed', err)
      return null
    }
  }
  if (ensureAudioContext.ctx?.state === 'suspended') {
    ensureAudioContext.ctx.resume().catch(() => {})
  }
  return ensureAudioContext.ctx
}

const stopSpeakingMonitor = (id, set) => {
  if (!id) return
  const session = speakingMonitors.get(id)
  if (session) {
    clearInterval(session.interval)
    try {
      session.source.disconnect()
    } catch (err) {
      console.warn('speaking monitor disconnect failed', err)
    }
    speakingMonitors.delete(id)
  }
  if (!set) return
  set((state) => {
    if (!state.voiceSpeaking || typeof state.voiceSpeaking !== 'object') return state
    if (typeof state.voiceSpeaking[id] === 'undefined') return state
    const next = { ...state.voiceSpeaking }
    delete next[id]
    return { voiceSpeaking: next }
  })
}

const startSpeakingMonitor = (id, stream, set) => {
  if (!id || !stream) return
  const context = ensureAudioContext()
  if (!context) return
  stopSpeakingMonitor(id)
  let source
  try {
    source = context.createMediaStreamSource(stream)
  } catch (err) {
    console.warn('media source init failed', err)
    return
  }
  const analyser = context.createAnalyser()
  analyser.smoothingTimeConstant = 0.8
  analyser.fftSize = 512
  source.connect(analyser)
  const buffer = new Uint8Array(analyser.frequencyBinCount)
  let lastState = false
  const interval = setInterval(() => {
    try {
      analyser.getByteFrequencyData(buffer)
      const avg = buffer.reduce((acc, value) => acc + value, 0) / buffer.length
      const speaking = avg > 45
      if (speaking !== lastState) {
        lastState = speaking
        set((state) => ({
          voiceSpeaking: { ...state.voiceSpeaking, [id]: speaking },
        }))
      }
    } catch (err) {
      console.warn('speaking monitor update failed', err)
    }
  }, 160)
  speakingMonitors.set(id, { analyser, source, interval })
}
ensureAudioContext.ctx = null

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
  stopSpeakingMonitor(socketId, set)
  set((state) => {
    const nextStreams = { ...state.voiceRemoteStreams }
    const nextStates = { ...state.voicePeerStates }
    const nextSpeaking = { ...state.voiceSpeaking }
    let changed = false
    if (nextStreams[socketId]) {
      delete nextStreams[socketId]
      changed = true
    }
    if (nextStates[socketId]) {
      delete nextStates[socketId]
      changed = true
    }
    if (typeof nextSpeaking[socketId] !== 'undefined') {
      delete nextSpeaking[socketId]
      changed = true
    }
    if (!changed) return state
    return { voiceRemoteStreams: nextStreams, voicePeerStates: nextStates, voiceSpeaking: nextSpeaking }
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
    startSpeakingMonitor(participant.socketId, remoteStream, set)
  }

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    set((current) => ({
      voicePeerStates: { ...current.voicePeerStates, [participant.socketId]: state },
    }))
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
    updatedAt: raw.updatedAt ?? raw.updated_at ?? 0,
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
  historyLoading: {},
  historyComplete: {},
  directPeers: {},
  files: {},
  channelMembers: {},
  typing: {},
  audioDevices: { inputs: [], outputs: [] },
  audioInputDeviceId: loadStoredDevice('audioInputDeviceId'),
  audioOutputDeviceId: loadStoredDevice('audioOutputDeviceId'),
  voiceRooms: [],
  voiceParticipants: {},
  voiceRemoteStreams: {},
  voicePeerStates: {},
  voiceSpeaking: {},
  activeVoiceRoomId: null,
  voiceStatus: null,
  voiceStream: null,
  voiceSelfSocketId: null,
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
      set({ voiceStream: stream, voiceStatus: 'connecting', activeVoiceRoomId: roomId, voiceSelfSocketId: null })
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
    speakingMonitors.forEach((_, key) => stopSpeakingMonitor(key))
    set((state) => ({
      activeVoiceRoomId: null,
      voiceStream: null,
      voiceStatus: null,
      voiceRemoteStreams: {},
      voicePeerStates: {},
      voiceSpeaking: {},
      voiceSelfSocketId: null,
      voiceParticipants: roomId ? { ...state.voiceParticipants, [roomId]: [] } : state.voiceParticipants,
    }))
  },
  createVoiceRoom: async (name, options = {}) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) throw new Error('invalid_name')
    const members = Array.isArray(options.members) ? options.members : []
    const admins = Array.isArray(options.admins) ? options.admins : []
    const payload = { name: trimmed }
    if (members.length) payload.members = members
    if (admins.length) payload.admins = admins
    const { data } = await axios.post(
      `${get().serverUrl}/api/voice-rooms`,
      payload,
      { headers: buildAuthHeaders(token) },
    )
    if (data?.room) {
      set((state) => ({ voiceRooms: [...state.voiceRooms.filter((room) => room.id !== data.room.id), data.room] }))
    }
  },
  updateVoiceRoomMembers: async (roomId, { upserts = [], remove = [] } = {}) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const { data } = await axios.post(
      `${get().serverUrl}/api/voice-rooms/${roomId}/members`,
      { upserts, remove },
      { headers: buildAuthHeaders(token) },
    )
    if (data?.room) {
      set((state) => ({
        voiceRooms: state.voiceRooms.some((room) => room.id === roomId)
          ? state.voiceRooms.map((room) => (room.id === roomId ? { ...room, ...data.room } : room))
          : [...state.voiceRooms, data.room],
      }))
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
      try {
        const { data: voiceData } = await axios.get(`${server}/api/voice-rooms`, { headers: buildAuthHeaders(get().token) })
        set({ voiceRooms: (voiceData.rooms || []).map((room) => ({ ...room })) })
      } catch (err) {
        console.error('voice rooms fetch failed', err)
      }
      get().refreshAudioDevices()
    })

    socket.on('connect_error', (err) => {
      scheduleReconnect(err)
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
        if (payload.channelId?.startsWith('dm:')) {
          const peerId = peerFromDirectChannel(payload.channelId, state.user?.id)
          if (peerId) result.directPeers = { ...state.directPeers, [payload.channelId]: peerId }
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

    socket.on('typing:update', ({ channelId, userId: typingUserId, username, typing }) => {
      if (!channelId || !typingUserId) return
      set((state) => {
        if (typingUserId === state.user?.id) return state
        const existing = state.typing[channelId] || []
        const filtered = existing.filter((entry) => entry.userId !== typingUserId)
        if (typing) {
          const nextList = [...filtered, { userId: typingUserId, username: username || typingUserId }]
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
    socket.on('voice:joined', ({ roomId, participant }) => {
      if (!roomId) return
      set((state) => {
        const list = state.voiceParticipants[roomId] || []
        const exists = participant ? list.some((p) => p.socketId === participant.socketId) : false
        const nextList = participant && !exists ? [...list, participant] : list
        return {
          voiceStatus: 'connected',
          activeVoiceRoomId: roomId,
          voiceSelfSocketId: participant?.socketId || state.voiceSelfSocketId,
          voiceParticipants: { ...state.voiceParticipants, [roomId]: nextList },
        }
      })
      const localStream = get().voiceStream
      if (participant?.socketId && localStream) {
        startSpeakingMonitor(participant.socketId, localStream, set)
      }
    })
    socket.on('voice:room-closed', ({ roomId }) => {
      if (get().activeVoiceRoomId === roomId) {
        get().leaveVoiceRoom(false)
        set({ voiceStatus: 'room_closed' })
      }
    })
    socket.on('voice:error', ({ error }) => set({ voiceStatus: error || 'error' }))
    socket.on('disconnect', (reason) => {
      const stream = get().voiceStream
      if (stream) stream.getTracks().forEach((track) => track.stop())
      voicePeerConnections.forEach((_, id) => teardownVoicePeer(id, set))
      voicePeerConnections.clear()
      speakingMonitors.forEach((_, key) => stopSpeakingMonitor(key))
      set({
        voiceStream: null,
        activeVoiceRoomId: null,
        voiceRemoteStreams: {},
        voicePeerStates: {},
        voiceSpeaking: {},
        voiceSelfSocketId: null,
        voiceStatus: 'disconnected',
      })
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

  editMessage: async (messageId, channelId, content) => {
    const token = get().token
    if (!token) throw new Error('not_authenticated')
    const trimmed = typeof content === 'string' ? content.trim() : ''
    if (!trimmed) throw new Error('invalid_content')
    const encrypted = enc.encrypt(channelId, trimmed)
    await axios.patch(
      `${get().serverUrl}/api/messages/${messageId}`,
      { content: encrypted },
      { headers: buildAuthHeaders(token) },
    )
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
