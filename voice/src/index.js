import 'dotenv/config'
import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import mediasoup from 'mediasoup'

const PORT = Number(process.env.VOICE_PORT || 4010)
const HOST = process.env.VOICE_HOST || '0.0.0.0'
const ANNOUNCED_IP = process.env.VOICE_ANNOUNCED_IP || undefined
const WEBRTC_PORT = Number(process.env.VOICE_WEBRTC_PORT || 44444)
const ORIGINS = (process.env.VOICE_ORIGIN || '*')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const log = (...args) => console.log(new Date().toISOString(), '[VOICE]', ...args)
const warn = (...args) => console.warn(new Date().toISOString(), '[VOICE]', ...args)

const app = express()
app.use(cors({ origin: ORIGINS.includes('*') ? true : ORIGINS }))
app.get('/health', (_req, res) => res.json({ ok: true }))

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: ORIGINS.includes('*') ? true : ORIGINS, methods: ['GET', 'POST'] },
})

const rooms = new Map()
let worker
let webRtcServer

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
]

const createWorker = async () => {
  const created = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.VOICE_RTC_MIN_PORT || 40000),
    rtcMaxPort: Number(process.env.VOICE_RTC_MAX_PORT || 49999),
    logLevel: process.env.VOICE_LOG_LEVEL || 'warn',
    logTags: ['ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  })
  created.on('died', () => {
    warn('mediasoup worker died, exiting process')
    setTimeout(() => process.exit(1), 1500)
  })
  return created
}

const createSharedWebRtcServer = async () => {
  const created = await worker.createWebRtcServer({
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress: ANNOUNCED_IP,
        port: WEBRTC_PORT,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress: ANNOUNCED_IP,
        port: WEBRTC_PORT,
      },
    ],
  })
  log('webrtc server started', `${ANNOUNCED_IP || HOST}:${WEBRTC_PORT}`)
  return created
}

const getOrCreateRoom = async (roomId) => {
  let room = rooms.get(roomId)
  if (room) return room

  const router = await worker.createRouter({ mediaCodecs })
  room = {
    id: roomId,
    router,
    peers: new Map(),
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  }
  rooms.set(roomId, room)
  log('room created', roomId)
  return room
}

const removeRoomIfEmpty = (roomId) => {
  const room = rooms.get(roomId)
  if (!room) return
  if (room.peers.size > 0) return
  try {
    room.router.close()
  } catch (_) {}
  rooms.delete(roomId)
  log('room closed', roomId)
}

const closePeerResources = (room, peerId) => {
  const peer = room.peers.get(peerId)
  if (!peer) return

  for (const consumerId of peer.consumers) {
    const record = room.consumers.get(consumerId)
    if (record) {
      try { record.consumer.close() } catch (_) {}
      room.consumers.delete(consumerId)
    }
  }

  for (const producerId of peer.producers) {
    const record = room.producers.get(producerId)
    if (record) {
      try { record.producer.close() } catch (_) {}
      room.producers.delete(producerId)
      io.to(room.id).emit('producerClosed', { producerId })
    }
  }

  for (const transportId of peer.transports) {
    const record = room.transports.get(transportId)
    if (record) {
      try { record.transport.close() } catch (_) {}
      room.transports.delete(transportId)
    }
  }

  room.peers.delete(peerId)
}

const transportMode = String(process.env.VOICE_TRANSPORT_MODE || process.env.VOICE_FORCE_TCP || '')
  .trim()
  .toLowerCase()
const TCP_ONLY = transportMode === 'tcp-only' || transportMode === 'only'

const createWebRtcTransport = async (router) => {
  const transport = await router.createWebRtcTransport({
    webRtcServer,
    enableUdp: !TCP_ONLY,
    enableTcp: true,
    preferUdp: !TCP_ONLY,
  })

  transport.on('dtlsstatechange', (state) => {
    log('transport dtlsstate', transport.id, state)
    if (state === 'closed') {
      try { transport.close() } catch (_) {}
    }
  })

  transport.on('icestatechange', (state) => {
    log('transport icestate', transport.id, state)
    if (state === 'connected') {
      const tuple = transport.iceSelectedTuple
      if (tuple) {
        log('transport tuple', transport.id, `${tuple.localIp}:${tuple.localPort} -> ${tuple.remoteIp}:${tuple.remotePort} ${tuple.protocol}`)
      }
    }
  })

  transport.on('trace', (trace) => {
    if (!trace) return
    log('transport trace', transport.id, trace.type || '-', trace.direction || '-', JSON.stringify(trace.info || {}))
  })

  return transport
}

const safeHandler = (socket, event, handler) => {
  socket.on(event, async (...args) => {
    const maybeAck = args[args.length - 1]
    const ack = typeof maybeAck === 'function' ? maybeAck : null
    const payload = ack ? args[0] : args[0]
    try {
      const result = await handler(payload)
      if (ack) ack({ ok: true, ...result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warn(event, 'failed', message)
      if (ack) ack({ ok: false, error: message })
    }
  })
}

const getRoom = (roomId) => {
  const room = rooms.get(roomId)
  if (!room) throw new Error('room_not_found')
  return room
}

const getPeer = (room, peerId) => {
  const peer = room.peers.get(peerId)
  if (!peer) throw new Error('peer_not_in_room')
  return peer
}

io.on('connection', (socket) => {
  log('socket connected', socket.id)

  safeHandler(socket, 'joinRoom', async ({ roomId, userId = null, displayName = null } = {}) => {
    if (!roomId || typeof roomId !== 'string') throw new Error('invalid_room_id')
    const room = await getOrCreateRoom(roomId)
    if (room.peers.has(socket.id)) {
      return {
        roomId,
        rtpCapabilities: room.router.rtpCapabilities,
        producerIds: Array.from(room.producers.keys()),
      }
    }

    room.peers.set(socket.id, {
      socket,
      userId,
      displayName,
      transports: new Set(),
      producers: new Set(),
      consumers: new Set(),
    })

    socket.join(roomId)
    io.to(roomId).emit('peerJoined', { peerId: socket.id, userId, displayName })

    return {
      roomId,
      rtpCapabilities: room.router.rtpCapabilities,
      producerIds: Array.from(room.producers.keys()),
    }
  })

  safeHandler(socket, 'createWebRtcTransport', async ({ roomId, direction = 'send' } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    const transport = await createWebRtcTransport(room.router)

    room.transports.set(transport.id, { transport, roomId, peerId: socket.id, direction })
    peer.transports.add(transport.id)

    return {
      transportOptions: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    }
  })

  safeHandler(socket, 'connectWebRtcTransport', async ({ roomId, transportId, dtlsParameters } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    if (!peer.transports.has(transportId)) throw new Error('transport_not_owned')

    const record = room.transports.get(transportId)
    if (!record) throw new Error('transport_not_found')
    await record.transport.connect({ dtlsParameters })
    return {}
  })

  safeHandler(socket, 'produce', async ({ roomId, transportId, kind, rtpParameters, appData = {} } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    if (!peer.transports.has(transportId)) throw new Error('transport_not_owned')

    const transportRecord = room.transports.get(transportId)
    if (!transportRecord) throw new Error('transport_not_found')

    const producer = await transportRecord.transport.produce({ kind, rtpParameters, appData })
    try {
      await producer.enableTraceEvent(['rtp', 'keyframe', 'nack', 'pli', 'fir'])
    } catch (_) {}

    room.producers.set(producer.id, { producer, roomId, peerId: socket.id })
    peer.producers.add(producer.id)

    producer.on('transportclose', () => {
      room.producers.delete(producer.id)
      peer.producers.delete(producer.id)
    })
    producer.on('score', (score) => {
      log('producer score', producer.id, JSON.stringify(score))
    })
    producer.on('trace', (trace) => {
      if (!trace) return
      log('producer trace', producer.id, trace.type || '-', trace.direction || '-', JSON.stringify(trace.info || {}))
    })

    io.to(roomId).emit('newProducer', { peerId: socket.id, producerId: producer.id, kind })

    return { producerId: producer.id }
  })

  safeHandler(socket, 'consume', async ({ roomId, transportId, producerId, rtpCapabilities } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    if (!peer.transports.has(transportId)) throw new Error('transport_not_owned')

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('cannot_consume')
    }

    const transportRecord = room.transports.get(transportId)
    if (!transportRecord) throw new Error('transport_not_found')

    const consumer = await transportRecord.transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    })

    room.consumers.set(consumer.id, { consumer, roomId, peerId: socket.id, producerId })
    peer.consumers.add(consumer.id)

    consumer.on('transportclose', () => {
      room.consumers.delete(consumer.id)
      peer.consumers.delete(consumer.id)
    })

    consumer.on('producerclose', () => {
      room.consumers.delete(consumer.id)
      peer.consumers.delete(consumer.id)
      socket.emit('consumerClosed', { consumerId: consumer.id, producerId })
    })

    return {
      consumerOptions: {
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      },
    }
  })

  safeHandler(socket, 'resumeConsumer', async ({ roomId, consumerId } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    if (!peer.consumers.has(consumerId)) throw new Error('consumer_not_owned')
    const record = room.consumers.get(consumerId)
    if (!record) throw new Error('consumer_not_found')
    await record.consumer.resume()
    return {}
  })

  safeHandler(socket, 'closeProducer', async ({ roomId, producerId } = {}) => {
    const room = getRoom(roomId)
    const peer = getPeer(room, socket.id)
    if (!peer.producers.has(producerId)) throw new Error('producer_not_owned')
    const record = room.producers.get(producerId)
    if (!record) return {}
    record.producer.close()
    room.producers.delete(producerId)
    peer.producers.delete(producerId)
    io.to(roomId).emit('producerClosed', { producerId })
    return {}
  })

  safeHandler(socket, 'leaveRoom', async ({ roomId } = {}) => {
    if (!roomId) return {}
    const room = rooms.get(roomId)
    if (!room) return {}
    closePeerResources(room, socket.id)
    socket.leave(roomId)
    io.to(roomId).emit('peerLeft', { peerId: socket.id })
    removeRoomIfEmpty(roomId)
    return {}
  })

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      if (!room.peers.has(socket.id)) continue
      closePeerResources(room, socket.id)
      io.to(roomId).emit('peerLeft', { peerId: socket.id })
      removeRoomIfEmpty(roomId)
    }
    log('socket disconnected', socket.id)
  })
})

const bootstrap = async () => {
  worker = await createWorker()
  webRtcServer = await createSharedWebRtcServer()
  server.listen(PORT, HOST, () => {
    log(`voice SFU started on ${HOST}:${PORT}`)
  })
}

bootstrap().catch((error) => {
  warn('voice bootstrap failed', error)
  process.exit(1)
})
